import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PendingChallengeService } from './pending-challenge.service.js';
import { REDIS_CLIENT } from '../../redis/redis.module.js';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PendingChallengeService', () => {
  let service: PendingChallengeService;
  let mockRedis: jest.Mocked<Record<string, jest.Mock>>;

  const jti = 'test-jti-uuid';
  const adminId = 'admin-uuid';

  const makePayload = (purpose: '2fa-setup' | '2fa-confirm', attempts = 0) =>
    JSON.stringify({ adminId, purpose, attempts });

  beforeEach(async () => {
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      getdel: jest.fn(),
      eval: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingChallengeService,
        { provide: REDIS_CLIENT, useValue: mockRedis },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'PENDING_2FA_TTL_MS') return '180000';
              throw new Error(`Config key not found: ${key}`);
            },
            get: (key: string) => {
              if (key === 'PENDING_2FA_MAX_ATTEMPTS') return '5';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get<PendingChallengeService>(PendingChallengeService);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('debería almacenar el challenge en Redis con la clave y TTL correctos', async () => {
      await service.create(jti, adminId, '2fa-setup');

      expect(mockRedis.set).toHaveBeenCalledWith(
        `pending-2fa:${jti}`,
        expect.stringContaining(adminId),
        'PX',
        180000,
      );
    });

    it('debería almacenar el purpose correcto en el payload', async () => {
      await service.create(jti, adminId, '2fa-confirm');

      const storedPayload = JSON.parse(mockRedis.set.mock.calls[0][1] as string);
      expect(storedPayload.purpose).toBe('2fa-confirm');
      expect(storedPayload.attempts).toBe(0);
    });

    it('debería lanzar ServiceUnavailableException si Redis falla', async () => {
      mockRedis.set.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.create(jti, adminId, '2fa-setup'))
        .rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ── verify ──────────────────────────────────────────────────────────────────

  describe('verify', () => {
    it('debería retornar adminId si el challenge existe y el purpose coincide', async () => {
      mockRedis.get.mockResolvedValue(makePayload('2fa-setup'));

      const result = await service.verify(jti, '2fa-setup');

      expect(result.adminId).toBe(adminId);
    });

    it('debería lanzar UnauthorizedException si el challenge no existe en Redis', async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(service.verify(jti, '2fa-setup')).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el purpose no coincide', async () => {
      mockRedis.get.mockResolvedValue(makePayload('2fa-confirm'));
      await expect(service.verify(jti, '2fa-setup')).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar ServiceUnavailableException si Redis no responde', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      await expect(service.verify(jti, '2fa-setup')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ── consume ─────────────────────────────────────────────────────────────────

  describe('consume', () => {
    it('debería retornar adminId y eliminar el challenge atómicamente (GETDEL)', async () => {
      mockRedis.getdel.mockResolvedValue(makePayload('2fa-setup'));

      const result = await service.consume(jti, '2fa-setup');

      expect(result.adminId).toBe(adminId);
      // GETDEL hace GET + DEL en una sola llamada — no hay un SET posterior
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('debería lanzar UnauthorizedException si el challenge no existe', async () => {
      mockRedis.getdel.mockResolvedValue(null);
      await expect(service.consume(jti, '2fa-setup')).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el purpose no coincide', async () => {
      mockRedis.getdel.mockResolvedValue(makePayload('2fa-confirm'));
      // Pese a que el purpose no coincide, el challenge ya fue eliminado (GETDEL)
      await expect(service.consume(jti, '2fa-setup')).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar ServiceUnavailableException si Redis no responde', async () => {
      mockRedis.getdel.mockRejectedValue(new Error('Redis down'));
      await expect(service.consume(jti, '2fa-setup')).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ── recordAttempt ───────────────────────────────────────────────────────────

  describe('recordAttempt', () => {
    it('debería retornar ok:true si el código TOTP es correcto', async () => {
      mockRedis.eval.mockResolvedValue('ok');

      const result = await service.recordAttempt(jti, '2fa-confirm', true);

      expect(result.ok).toBe(true);
    });

    it('debería retornar ok:false reason:max_attempts si se superó el límite de intentos', async () => {
      mockRedis.eval.mockResolvedValue('max_attempts');

      const result = await service.recordAttempt(jti, '2fa-confirm', false);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('max_attempts');
    });

    it('debería retornar ok:false reason:not_found si el challenge no existe', async () => {
      mockRedis.eval.mockResolvedValue('not_found');

      const result = await service.recordAttempt(jti, '2fa-confirm', false);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    it('debería retornar ok:false reason:not_found para retry (intento fallido, challenge aún activo)', async () => {
      // 'retry' es el resultado interno del Lua script cuando el intento falla
      // pero el challenge sigue activo. Se expone como 'not_found' para el llamador.
      mockRedis.eval.mockResolvedValue('retry');

      const result = await service.recordAttempt(jti, '2fa-confirm', false);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    it('debería retornar ok:false reason:redis_unavailable si Redis falla', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection lost'));

      const result = await service.recordAttempt(jti, '2fa-confirm', false);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('redis_unavailable');
    });

    it('debería pasar el purpose y el resultado TOTP al script Lua', async () => {
      mockRedis.eval.mockResolvedValue('ok');

      await service.recordAttempt(jti, '2fa-confirm', true);

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String), // script Lua
        1,
        `pending-2fa:${jti}`,
        '2fa-confirm',
        '1',           // totpValid = true → '1'
        expect.any(String), // maxAttempts
      );
    });

    it('debería pasar totpValid=false como "0" al script Lua', async () => {
      mockRedis.eval.mockResolvedValue('retry');

      await service.recordAttempt(jti, '2fa-confirm', false);

      const callArgs = mockRedis.eval.mock.calls[0];
      expect(callArgs[4]).toBe('0'); // totpValid = false → '0'
    });
  });
});
