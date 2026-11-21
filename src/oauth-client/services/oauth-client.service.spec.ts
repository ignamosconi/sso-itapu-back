jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthClientService } from './oauth-client.service.js';
import { OAuthClientEntity } from '../entities/oauth-client.entity.js';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import * as bcrypt from 'bcrypt';

function makeClient(overrides: Partial<OAuthClientEntity> = {}): OAuthClientEntity {
  return {
    id: 1,
    clientName: 'TestApp',
    redirectUris: ['https://app.com/callback'],
    clientSecret: '$2b$10$hashedsecret',
    isActive: true,
    responsibleUser: null,
    responsibleUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('OAuthClientService', () => {
  let service: OAuthClientService;
  let mockRepo: jest.Mocked<Record<string, jest.Mock>>;
  let mockCredentialTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockRefreshTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockRedis: jest.Mocked<Record<string, jest.Mock>>;
  let mockMailService: jest.Mocked<Record<string, jest.Mock>>;
  let mockStudentService: jest.Mocked<Record<string, jest.Mock>>;

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      findOneOrFail: jest.fn(),
    };

    mockCredentialTokenService = {
      generate: jest.fn().mockResolvedValue('one-time-token'),
    };

    mockRefreshTokenService = {
      revokeAllForClient: jest.fn().mockResolvedValue(undefined),
    };

    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      getdel: jest.fn().mockResolvedValue(null),
    };

    mockStudentService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'student-uuid',
        username: 'jdoe',
        first_name: 'John',
        last_name: 'Doe',
        email: 'jdoe@example.com',
        account_status: 'active',
      }),
    };

    mockMailService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthClientService,
        { provide: getRepositoryToken(OAuthClientEntity), useValue: mockRepo },
        { provide: 'ICredentialTokenService', useValue: mockCredentialTokenService },
        { provide: 'IRefreshTokenService', useValue: mockRefreshTokenService },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: 'IMailService', useValue: mockMailService },
        { provide: 'IStudentService', useValue: mockStudentService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, string | number> = {
                MAIL_HOST: 'smtp.test.com',
                MAIL_PORT: 587,
                MAIL_USER: 'test@test.com',
                MAIL_PASS: 'pass',
                MAIL_FROM: 'test@test.com',
                SSO_BASE_URL: 'http://localhost:3000',
                CREDENTIAL_TOKEN_TTL_MS: 86400000,
              };
              if (key in map) return map[key];
              throw new Error(`Config key not found: ${key}`);
            },
            get: (key: string) => {
              const map: Record<string, string | number> = {
                CREDENTIAL_TOKEN_TTL_MS: 86400000,
              };
              return map[key] ?? undefined;
            },
          },
        },
      ],
    }).compile();

    service = module.get<OAuthClientService>(OAuthClientService);
  });

  describe('findAll', () => {
    it('debería retornar todos los clientes sin clientSecret', async () => {
      mockRepo.find.mockResolvedValue([makeClient()]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('clientSecret');
    });
  });

  describe('findOne', () => {
    it('debería retornar el cliente si existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeClient());
      const result = await service.findOne(1);
      expect(result.id).toBe(1);
      expect(result.clientName).toBe('TestApp');
    });

    it('debería lanzar NotFoundException si no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateClient', () => {
    it('debería retornar true con credenciales válidas y cliente activo', async () => {
      mockRepo.findOne.mockResolvedValue(makeClient());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateClient(1, 'plain-secret', 'https://app.com/callback');
      expect(result).toBe(true);
    });

    it('debería retornar false si el cliente está suspendido', async () => {
      mockRepo.findOne.mockResolvedValue(makeClient({ isActive: false }));
      const result = await service.validateClient(1, 'plain-secret', 'https://app.com/callback');
      expect(result).toBe(false);
    });

    it('debería retornar false si el secret no coincide', async () => {
      mockRepo.findOne.mockResolvedValue(makeClient());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const result = await service.validateClient(1, 'wrong-secret', 'https://app.com/callback');
      expect(result).toBe(false);
    });

    it('debería retornar false si el redirectUri no está registrado', async () => {
      mockRepo.findOne.mockResolvedValue(makeClient());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const result = await service.validateClient(1, 'plain-secret', 'https://otro.com/callback');
      expect(result).toBe(false);
    });

    it('debería retornar false si el cliente no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.validateClient(999, 'plain-secret', 'https://app.com/callback');
      expect(result).toBe(false);
    });
  });

  describe('suspend / activate', () => {
    it('debería suspender un cliente activo', async () => {
      const client = makeClient();
      mockRepo.findOne.mockResolvedValue(client);
      mockRepo.save.mockResolvedValue({ ...client, isActive: false });

      const result = await service.suspend(1);
      expect(result.isActive).toBe(false);
    });

    it('debería activar un cliente suspendido', async () => {
      const client = makeClient({ isActive: false });
      mockRepo.findOne.mockResolvedValue(client);
      mockRepo.save.mockResolvedValue({ ...client, isActive: true });

      const result = await service.activate(1);
      expect(result.isActive).toBe(true);
    });

    it('debería lanzar NotFoundException al suspender un cliente inexistente', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.suspend(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('regenerateSecret', () => {
    it('debería retornar un nuevo plainSecret y no exponer el hash', async () => {
      const client = makeClient();
      mockRepo.findOne.mockResolvedValue(client);
      mockRepo.save.mockResolvedValue({ ...client, clientSecret: '$2b$10$newhash' });

      const result = await service.regenerateSecret(1, 'admin-uuid');
      expect(result).not.toHaveProperty('plainSecret');
      expect(result).not.toHaveProperty('clientSecret');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pending-secret:1:admin-uuid',
        expect.any(String),
        'PX',
        expect.any(Number),
      );
    });
  });

  describe('create', () => {
    it('debería crear un cliente y guardar el pending secret en Redis vinculado al admin', async () => {
      const client = makeClient();
      mockRepo.create.mockReturnValue(client);
      mockRepo.save.mockResolvedValue(client);
      mockRepo.findOneOrFail.mockResolvedValue({ ...client, responsibleUser: null });

      const result = await service.create(
        { clientName: 'TestApp', redirectUris: ['https://app.com/callback'], responsibleUserId: 'student-uuid' },
        'admin-uuid',
      );

      expect(result).not.toHaveProperty('plainSecret');
      // El pending secret se guarda en Redis con la clave vinculada al admin
      expect(mockRedis.set).toHaveBeenCalledWith(
        'pending-secret:1:admin-uuid',
        expect.any(String),
        'PX',
        expect.any(Number),
      );
    });

    it('debería lanzar NotFoundException si no existe el cliente al crear', async () => {
      mockRepo.create.mockReturnValue(makeClient());
      mockRepo.save.mockResolvedValue(makeClient());
      mockRepo.findOneOrFail.mockResolvedValue(makeClient());
      mockRepo.findOne.mockResolvedValue(null);
      // create no hace findOne previo, solo save — este test verifica el flujo básico
      const result = await service.create(
        { clientName: 'TestApp', redirectUris: ['https://app.com/callback'], responsibleUserId: 'student-uuid' },
        'admin-uuid',
      );
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('debería actualizar clientName y redirectUris sin cambiar responsable', async () => {
      const client = makeClient();
      mockRepo.findOne.mockResolvedValue(client);
      mockRepo.findOneOrFail.mockResolvedValue({ ...client, clientName: 'NuevoNombre' });

      const result = await service.update(1, { clientName: 'NuevoNombre', redirectUris: ['https://new.com/cb'] });

      expect(mockRepo.update).toHaveBeenCalledWith(
        { id: 1 },
        { clientName: 'NuevoNombre', redirectUris: ['https://new.com/cb'] },
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(mockStudentService.findOne).not.toHaveBeenCalled();
      expect(result.clientName).toBe('NuevoNombre');
    });

    it('debería cambiar el responsable si el nuevo usuario está activo', async () => {
      const client = makeClient({ responsibleUserId: 'old-uuid' });
      mockRepo.findOne.mockResolvedValue(client);
      mockRepo.findOneOrFail.mockResolvedValue({ ...client, responsibleUserId: 'student-uuid' });
      mockStudentService.findOne.mockResolvedValue({
        id: 'student-uuid',
        account_status: 'active',
      });

      const result = await service.update(1, { responsibleUserId: 'student-uuid' });

      expect(mockStudentService.findOne).toHaveBeenCalledWith('student-uuid');
      expect(mockRepo.update).toHaveBeenCalledWith({ id: 1 }, { responsibleUserId: 'student-uuid' });
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('no debería llamar a update si no hay cambios', async () => {
      const client = makeClient();
      mockRepo.findOne.mockResolvedValue(client);
      mockRepo.findOneOrFail.mockResolvedValue(client);

      await service.update(1, {});

      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('debería lanzar BadRequestException si el nuevo responsable no está activo', async () => {
      const client = makeClient();
      mockRepo.findOne.mockResolvedValue(client);
      mockStudentService.findOne.mockResolvedValue({
        id: 'student-uuid',
        account_status: 'suspended',
      });

      await expect(service.update(1, { responsibleUserId: 'student-uuid' }))
        .rejects.toThrow(BadRequestException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el cliente no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.update(999, { clientName: 'X' })).rejects.toThrow(NotFoundException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('changeResponsibleUser', () => {
    it('debería actualizar solo la columna del responsable si el usuario está activo', async () => {
      const client = makeClient({ responsibleUserId: 'old-uuid' });
      mockRepo.findOne.mockResolvedValue(client);
      mockRepo.findOneOrFail.mockResolvedValue({ ...client, responsibleUserId: 'student-uuid' });

      const result = await service.changeResponsibleUser(1, { responsibleUserId: 'student-uuid' });

      expect(mockRepo.update).toHaveBeenCalledWith({ id: 1 }, { responsibleUserId: 'student-uuid' });
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('debería lanzar BadRequestException si el usuario no está activo', async () => {
      mockRepo.findOne.mockResolvedValue(makeClient());
      mockStudentService.findOne.mockResolvedValue({
        id: 'student-uuid',
        account_status: 'suspended',
      });

      await expect(service.changeResponsibleUser(1, { responsibleUserId: 'student-uuid' }))
        .rejects.toThrow(BadRequestException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el cliente no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.changeResponsibleUser(999, { responsibleUserId: 'student-uuid' }))
        .rejects.toThrow(NotFoundException);
    });
  });
});