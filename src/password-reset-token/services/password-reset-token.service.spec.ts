import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetTokenService } from './password-reset-token.service.js';
import { PasswordResetTokenEntity } from '../entities/password-reset-token.entity.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(overrides: Partial<PasswordResetTokenEntity> = {}): PasswordResetTokenEntity {
  return {
    id: 'uuid-1',
    tokenHash: 'some-hash',
    studentId: 'student-uuid',
    purpose: 'reset',
    used: false,
    expiresAt: new Date(Date.now() + 86400000), // 24h en el futuro
    createdAt: new Date(),
    ...overrides,
  };
}

function makeQueryBuilder(executeResult: { affected: number; raw: unknown[] }) {
  return {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(executeResult),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PasswordResetTokenService', () => {
  let service: PasswordResetTokenService;
  let mockRepo: jest.Mocked<Record<string, jest.Mock>>;

  beforeEach(async () => {
    mockRepo = {
      save: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetTokenService,
        { provide: getRepositoryToken(PasswordResetTokenEntity), useValue: mockRepo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'PASSWORD_RESET_TOKEN_TTL_MS') return '86400000';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get<PasswordResetTokenService>(PasswordResetTokenService);
  });

  // ── generate ────────────────────────────────────────────────────────────────

  describe('generate', () => {
    it('debería retornar un token en texto plano no vacío', async () => {
      const token = await service.generate('student-uuid', 'setup');

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('debería guardar el hash del token, nunca el texto plano', async () => {
      const token = await service.generate('student-uuid', 'reset');

      const savedCall = mockRepo.save.mock.calls[0][0];
      expect(savedCall.tokenHash).toBeDefined();
      expect(savedCall.tokenHash).not.toBe(token); // nunca guardamos el plain
    });

    it('debería guardar el studentId y purpose correctos', async () => {
      await service.generate('student-uuid', 'setup');

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'student-uuid',
          purpose: 'setup',
          expiresAt: expect.any(Date),
        }),
      );
    });

    it('debería eliminar tokens anteriores del mismo alumno y propósito antes de generar uno nuevo (fix 9)', async () => {
      await service.generate('student-uuid', 'reset');

      expect(mockRepo.delete).toHaveBeenCalledWith({
        studentId: 'student-uuid',
        purpose: 'reset',
        used: false,
      });
      // El delete debe ocurrir antes del save
      const deleteOrder = mockRepo.delete.mock.invocationCallOrder[0];
      const saveOrder = mockRepo.save.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(saveOrder);
    });

    it('debería generar tokens diferentes en cada llamada', async () => {
      const token1 = await service.generate('student-uuid', 'reset');
      const token2 = await service.generate('student-uuid', 'reset');
      expect(token1).not.toBe(token2);
    });
  });

  // ── validate ────────────────────────────────────────────────────────────────

  describe('validate', () => {
    it('debería retornar studentId y purpose si el token es válido', async () => {
      mockRepo.findOne.mockResolvedValue(makeToken());

      const result = await service.validate('valid-token');

      expect(result.studentId).toBe('student-uuid');
      expect(result.purpose).toBe('reset');
    });

    it('debería lanzar NotFoundException si el token no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.validate('inexistente')).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar GoneException si el token ya fue usado', async () => {
      mockRepo.findOne.mockResolvedValue(makeToken({ used: true }));
      await expect(service.validate('token-usado')).rejects.toThrow(GoneException);
    });

    it('debería lanzar GoneException si el token expiró', async () => {
      mockRepo.findOne.mockResolvedValue(
        makeToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.validate('token-expirado')).rejects.toThrow(GoneException);
    });

    it('no debería consumir el token (solo lectura)', async () => {
      mockRepo.findOne.mockResolvedValue(makeToken());
      await service.validate('valid-token');
      expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ── consume ─────────────────────────────────────────────────────────────────

  describe('consume', () => {
    it('debería retornar studentId y purpose si el token es válido y marcarlo como usado', async () => {
      const record = makeToken();
      mockRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ affected: 1, raw: [record] }),
      );

      const result = await service.consume('valid-token');

      expect(result.studentId).toBe('student-uuid');
      expect(result.purpose).toBe('reset');
    });

    it('debería lanzar NotFoundException si el token no existe', async () => {
      mockRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ affected: 0, raw: [] }),
      );
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.consume('inexistente')).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar GoneException si el token ya fue usado', async () => {
      mockRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ affected: 0, raw: [] }),
      );
      mockRepo.findOne.mockResolvedValue(makeToken({ used: true }));

      await expect(service.consume('token-usado')).rejects.toThrow(GoneException);
    });

    it('debería lanzar GoneException si el token expiró', async () => {
      mockRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ affected: 0, raw: [] }),
      );
      mockRepo.findOne.mockResolvedValue(
        makeToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.consume('token-expirado')).rejects.toThrow(GoneException);
    });

    it('debería ser idempotente — un segundo consume del mismo token lanza GoneException', async () => {
      // Primer consume: exitoso
      const record = makeToken();
      mockRepo.createQueryBuilder.mockReturnValueOnce(
        makeQueryBuilder({ affected: 1, raw: [record] }),
      );
      await service.consume('valid-token');

      // Segundo consume: el token ya está marcado como usado
      mockRepo.createQueryBuilder.mockReturnValueOnce(
        makeQueryBuilder({ affected: 0, raw: [] }),
      );
      mockRepo.findOne.mockResolvedValue(makeToken({ used: true }));

      await expect(service.consume('valid-token')).rejects.toThrow(GoneException);
    });
  });

  // ── invalidateAllForStudent ─────────────────────────────────────────────────
  describe('invalidateAllForStudent', () => {
    it('debería borrar los links pendientes del alumno (de cualquier propósito)', async () => {
      await service.invalidateAllForStudent('student-uuid');

      expect(mockRepo.delete).toHaveBeenCalledWith({ studentId: 'student-uuid', used: false });
    });

    it('debería usar el repositorio del manager si se lo pasan (para correr dentro de una transacción)', async () => {
      const txRepo = { delete: jest.fn().mockResolvedValue({}) };
      const manager = { getRepository: jest.fn().mockReturnValue(txRepo) };

      await service.invalidateAllForStudent('student-uuid', manager as never);

      expect(manager.getRepository).toHaveBeenCalledWith(PasswordResetTokenEntity);
      expect(txRepo.delete).toHaveBeenCalledWith({ studentId: 'student-uuid', used: false });
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });
});
