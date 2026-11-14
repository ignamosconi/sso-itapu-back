jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException, ConflictException, BadRequestException, UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service.js';
import { AdminEntity } from '../entities/admin.entity.js';

type MockEntityManager = {
  remove: jest.Mock;
  getRepository: jest.Mock;
};

type MockRepository = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  count: jest.Mock;
  remove: jest.Mock;
  manager: {
    transaction: jest.Mock;
  };
};

type MockRefreshTokenService = {
  revokeAllForSub: jest.Mock;
};

function makeAdmin(overrides: Partial<AdminEntity> = {}): AdminEntity {
  return {
    id: 'uuid-1',
    username: 'admin',
    password: '$2b$12$hashedpassword',
    totpSecret: null,
    totpEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AdminService', () => {
  let service: AdminService;
  let mockRepo: MockRepository;
  let mockRefreshTokenService: MockRefreshTokenService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      remove: jest.fn(),
      manager: {
        transaction: jest.fn(),
      },
    };

    mockRefreshTokenService = {
      revokeAllForSub: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(AdminEntity), useValue: mockRepo },
        { provide: 'IRefreshTokenService', useValue: mockRefreshTokenService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe('findAll', () => {
    it('debería retornar todos los admins mapeados a DTO', async () => {
      mockRepo.find.mockResolvedValue([makeAdmin(), makeAdmin({ id: 'uuid-2', username: 'otro' })]);
      const result = await service.findAll();
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('password');
    });
  });

  describe('findOne', () => {
    it('debería retornar el admin si existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeAdmin());
      const result = await service.findOne('uuid-1');
      expect(result.id).toBe('uuid-1');
      expect(result.username).toBe('admin');
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('debería crear un admin nuevo', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(makeAdmin());
      mockRepo.save.mockResolvedValue(makeAdmin());

      const result = await service.create({ username: 'admin', password: 'password123' });
      expect(result.username).toBe('admin');
      expect(result).not.toHaveProperty('password');
    });

    it('debería lanzar ConflictException si el username ya existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeAdmin());
      await expect(service.create({ username: 'admin', password: 'password123' }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('removeSelf', () => {
    const validDeleteDto = {
      password: 'password123',
      confirmationPhrase: 'borrar-mi-cuenta-no-es-reversible',
    };

    it('debería lanzar NotFoundException si el admin no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.removeSelf('inexistente', validDeleteDto))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      mockRepo.findOne.mockResolvedValue(makeAdmin());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.removeSelf('uuid-1', {
          password: 'wrong-password',
          confirmationPhrase: 'borrar-mi-cuenta-no-es-reversible',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar BadRequestException si es el último admin', async () => {
      mockRepo.findOne.mockResolvedValue(makeAdmin());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.count.mockResolvedValue(1);

      await expect(service.removeSelf('uuid-1', validDeleteDto))
        .rejects.toThrow(BadRequestException);
    });

    it('debería revocar tokens y eliminar el admin en una transacción', async () => {
      mockRepo.findOne.mockResolvedValue(makeAdmin());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.count.mockResolvedValue(2);

      mockRepo.manager.transaction.mockImplementation(
        async (
          cb: (manager: MockEntityManager) => Promise<void>,
        ): Promise<void> => {
          await cb({
            remove: jest.fn(),
            getRepository: jest.fn(),
          });
        },
      );
      mockRefreshTokenService.revokeAllForSub.mockResolvedValue(undefined);

      await service.removeSelf('uuid-1', validDeleteDto);

      expect(mockRepo.manager.transaction).toHaveBeenCalled();
      expect(mockRefreshTokenService.revokeAllForSub).toHaveBeenCalledWith('uuid-1', expect.anything());
    });
  });
});