jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('otplib', () => ({
  authenticator: {
    generateSecret: jest.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
    keyuri: jest.fn().mockReturnValue('otpauth://totp/admin?secret=JBSWY3DPEHPK3PXP'),
    verify: jest.fn(),
  },
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,fakeqr'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminEntity } from '../../admin/entities/admin.entity.js';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';

const TOTP_KEY = 'b'.repeat(64);
const ACCESS_SECRET = 'access-secret';
const REFRESH_SECRET = 'refresh-secret';

function makeAdmin(overrides: Partial<AdminEntity> = {}): AdminEntity {
  return {
    id: 'admin-uuid',
    username: 'admin',
    password: '$2b$12$placeholder',
    totpSecret: null,
    totpEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AdminAuthService', () => {
  let service: AdminAuthService;

  let mockRepo: jest.Mocked<Record<string, jest.Mock>>;
  let mockJwtService: jest.Mocked<Partial<JwtService>>;
  let mockRefreshTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockPendingChallengeService: jest.Mocked<Record<string, jest.Mock>>;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };

    mockRefreshTokenService = {
      save: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn(),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
    };

    // Mock del PendingChallengeService — simula Redis sin necesitar conexión real.
    // create: registra el challenge exitosamente.
    // verify: valida el challenge exitosamente (no lanza).
    // consume: consume el challenge exitosamente (no lanza).
    // recordAttempt: por defecto simula código correcto.
    mockPendingChallengeService = {
      create: jest.fn().mockResolvedValue(undefined),
      verify: jest.fn().mockResolvedValue({ adminId: 'admin-uuid' }),
      consume: jest.fn().mockResolvedValue({ adminId: 'admin-uuid' }),
      recordAttempt: jest.fn().mockResolvedValue({ ok: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: getRepositoryToken(AdminEntity), useValue: mockRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: 'IRefreshTokenService', useValue: mockRefreshTokenService },
        { provide: 'IPendingChallengeService', useValue: mockPendingChallengeService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, string> = {
                JWT_ADMIN_ACCESS_SECRET: ACCESS_SECRET,
                JWT_ADMIN_REFRESH_SECRET: REFRESH_SECRET,
                JWT_ADMIN_ACCESS_EXPIRES_IN: '15m',
                JWT_ADMIN_REFRESH_EXPIRES_IN: '1d',
                TOTP_ENCRYPTION_KEY: TOTP_KEY,
                PENDING_2FA_TTL_MS: '180000',
              };
              if (key in map) return map[key];
              throw new Error(`Config key not found: ${key}`);
            },
          },
        },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
  });

  describe('login', () => {
    it('debería retornar pending_token con requires_2fa_setup=true si el admin no tiene 2FA', async () => {
      const admin = makeAdmin();
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.findOne.mockResolvedValue(admin);

      const result = await service.login({ username: 'admin', password: 'password123' });

      expect(result.pending_token).toBeDefined();
      expect(result.requires_2fa_setup).toBe(true);
    });

    it('debería retornar requires_2fa_setup=false si el admin ya tiene 2FA activo', async () => {
      const admin = makeAdmin({ totpEnabled: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.findOne.mockResolvedValue(admin);

      const result = await service.login({ username: 'admin', password: 'password123' });

      expect(result.requires_2fa_setup).toBe(false);
    });

    it('debería lanzar UnauthorizedException con credenciales inválidas', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.login({ username: 'admin', password: 'wrong' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si la password no coincide', async () => {
      mockRepo.findOne.mockResolvedValue(makeAdmin());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login({ username: 'admin', password: 'wrong' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('debería revocar la familia del refresh token', async () => {
      await service.logout({ refresh_token: 'some-refresh-token' });
      expect(mockRefreshTokenService.revokeFamily).toHaveBeenCalledWith('some-refresh-token');
    });
  });

  describe('validate2fa', () => {
    it('debería lanzar UnauthorizedException si el pending token es inválido', async () => {
      mockJwtService.verifyAsync = jest.fn().mockRejectedValue(new Error('invalid'));
      await expect(service.validate2fa({ pending_token: 'bad', totp_code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el admin no tiene 2FA configurado', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({
        sub: 'admin-uuid',
        jti: 'test-jti',
        purpose: '2fa-confirm',
        type: 'pending-2fa',
      });
      mockRepo.findOne.mockResolvedValue(makeAdmin({ totpEnabled: false }));

      await expect(service.validate2fa({ pending_token: 'valid', totp_code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('setup2fa', () => {
    it('debería retornar QR, secret manual y confirm_pending_token', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({
        sub: 'admin-uuid',
        jti: 'test-jti',
        purpose: '2fa-setup',
        type: 'pending-2fa',
      });
      mockRepo.findOne.mockResolvedValue(makeAdmin({ totpEnabled: false }));
      mockRepo.save.mockResolvedValue(makeAdmin());

      const result = await service.setup2fa({ pending_token: 'pending-token' });

      expect(result.qrCodeDataUrl).toBeDefined();
      expect(result.manualEntrySecret).toBe('JBSWY3DPEHPK3PXP');
      expect(result.confirm_pending_token).toBeDefined();
      expect(mockPendingChallengeService.consume).toHaveBeenCalledWith('test-jti', '2fa-setup');
    });

    it('debería lanzar ForbiddenException si el admin ya tiene 2FA activo', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({
        sub: 'admin-uuid',
        jti: 'test-jti',
        purpose: '2fa-setup',
        type: 'pending-2fa',
      });
      mockRepo.findOne.mockResolvedValue(makeAdmin({ totpEnabled: true }));

      const { ForbiddenException } = await import('@nestjs/common');
      await expect(service.setup2fa({ pending_token: 'pending-token' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('debería lanzar UnauthorizedException si el pending_token es inválido', async () => {
      mockJwtService.verifyAsync = jest.fn().mockRejectedValue(new Error('invalid'));
      await expect(service.setup2fa({ pending_token: 'bad' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('confirm2fa', () => {
    it('debería activar el 2FA y retornar tokens si el código TOTP es correcto', async () => {
      // Generamos un totpSecret cifrado válido usando la clave del service
      const encryptedSecret = (service as unknown as Record<string, (s: string) => string>)
        .encryptTotp('JBSWY3DPEHPK3PXP');

      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({
        sub: 'admin-uuid',
        jti: 'test-jti',
        purpose: '2fa-confirm',
        type: 'pending-2fa',
      });
      mockRepo.findOne.mockResolvedValue(makeAdmin({ totpSecret: encryptedSecret }));
      mockRepo.save.mockResolvedValue(makeAdmin({ totpEnabled: true }));
      (authenticator.verify as jest.Mock).mockReturnValue(true);
      mockPendingChallengeService.recordAttempt.mockResolvedValue({ ok: true });

      const result = await service.confirm2fa({ pending_token: 'pending', totp_code: '123456' });

      expect(result.access_token).toBeDefined();
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ totpEnabled: true }),
      );
    });

    it('debería lanzar UnauthorizedException si el código TOTP es incorrecto', async () => {
      const encryptedSecret = (service as unknown as Record<string, (s: string) => string>)
        .encryptTotp('JBSWY3DPEHPK3PXP');

      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({
        sub: 'admin-uuid',
        jti: 'test-jti',
        purpose: '2fa-confirm',
        type: 'pending-2fa',
      });
      mockRepo.findOne.mockResolvedValue(makeAdmin({ totpSecret: encryptedSecret }));
      (authenticator.verify as jest.Mock).mockReturnValue(false);
      mockPendingChallengeService.recordAttempt.mockResolvedValue({ ok: false, reason: 'not_found' });

      await expect(service.confirm2fa({ pending_token: 'pending', totp_code: '000000' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el pending_token es inválido', async () => {
      mockJwtService.verifyAsync = jest.fn().mockRejectedValue(new Error('invalid'));
      await expect(service.confirm2fa({ pending_token: 'bad', totp_code: '123456' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('reset2fa', () => {
    it('debería resetear el 2FA si la contraseña es correcta', async () => {
      mockRepo.findOne.mockResolvedValue(makeAdmin({ totpEnabled: true, totpSecret: 'cifrado' }));
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.save.mockResolvedValue(makeAdmin({ totpEnabled: false, totpSecret: null }));

      await service.reset2fa('admin-uuid', { password: 'correcta' });

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ totpEnabled: false, totpSecret: null }),
      );
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      mockRepo.findOne.mockResolvedValue(makeAdmin());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.reset2fa('admin-uuid', { password: 'incorrecta' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el admin no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.reset2fa('no-existe', { password: 'x' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('debería retornar nuevos tokens con refresh token válido', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({
        sub: 'admin-uuid',
        type: 'refresh',
      });
      mockRefreshTokenService.consume.mockResolvedValue({ familyId: 'family-uuid' });
      mockRepo.findOne.mockResolvedValue(makeAdmin());

      const result = await service.refresh({ refresh_token: 'valid-refresh' });

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(mockRefreshTokenService.save).toHaveBeenCalled();
    });

    it('debería lanzar UnauthorizedException si el refresh token es inválido', async () => {
      mockJwtService.verifyAsync = jest.fn().mockRejectedValue(new Error('invalid'));
      await expect(service.refresh({ refresh_token: 'bad' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el token no es de tipo refresh', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({ sub: 'admin-uuid', type: 'access' });
      await expect(service.refresh({ refresh_token: 'access-token' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería emitir tokens si el código TOTP es correcto', async () => {
      const encryptedSecret = (service as unknown as Record<string, (s: string) => string>)
        .encryptTotp('JBSWY3DPEHPK3PXP');

      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({
        sub: 'admin-uuid',
        jti: 'test-jti',
        purpose: '2fa-confirm',
        type: 'pending-2fa',
      });
      mockRepo.findOne.mockResolvedValue(makeAdmin({ totpEnabled: true, totpSecret: encryptedSecret }));
      (authenticator.verify as jest.Mock).mockReturnValue(true);
      mockPendingChallengeService.recordAttempt.mockResolvedValue({ ok: true });

      const result = await service.validate2fa({ pending_token: 'pending', totp_code: '123456' });
      expect(result.access_token).toBeDefined();
    });
  });
});