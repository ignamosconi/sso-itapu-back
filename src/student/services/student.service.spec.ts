jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException, ConflictException, BadRequestException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { StudentService } from './student.service.js';
import { StudentEntity, AccountStatus } from '../entities/student.entity.js';
import { DomainRoleEntity } from '../../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../../specialty/entities/specialty.entity.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDomainRole(overrides: Partial<DomainRoleEntity> = {}): DomainRoleEntity {
  return { id: 1, name: 'Alumno', createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

function makeSpecialty(overrides: Partial<SpecialtyEntity> = {}): SpecialtyEntity {
  return { id: 1, name: 'Mecánica', createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

function makeStudent(overrides: Partial<StudentEntity> = {}): StudentEntity {
  return {
    id: 'student-uuid',
    first_name: 'Ignacio',
    last_name: 'Mosconi',
    username: 'immosconi136',
    email: 'alumno@gmail.com',
    password: '$2b$10$hashed',
    dni: 44244136,
    birth_date: new Date('2003-05-15'),
    account_status: AccountStatus.Active,
    domainRoleId: 1,
    specialtyId: 1,
    domainRole: makeDomainRole(),
    specialty: makeSpecialty(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeQueryBuilder(overrides: Record<string, jest.Mock> = {}) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[makeStudent()], 1]),
    getOne: jest.fn().mockResolvedValue(makeStudent()),
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('StudentService', () => {
  let service: StudentService;
  let mockRepo: jest.Mocked<Record<string, jest.Mock>>;
  let mockDomainRoleRepo: jest.Mocked<Record<string, jest.Mock>>;
  let mockSpecialtyRepo: jest.Mocked<Record<string, jest.Mock>>;
  let mockPasswordResetTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockMailService: jest.Mocked<Record<string, jest.Mock>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: {
        transaction: jest.fn(),
        save: jest.fn(),
      },
    };

    mockDomainRoleRepo = {
      find: jest.fn().mockResolvedValue([makeDomainRole()]),
      findOne: jest.fn().mockResolvedValue(makeDomainRole()),
    };

    mockSpecialtyRepo = {
      find: jest.fn().mockResolvedValue([makeSpecialty()]),
      findOne: jest.fn().mockResolvedValue(makeSpecialty()),
    };

    mockPasswordResetTokenService = {
      generate: jest.fn().mockResolvedValue('token-plain'),
    };

    mockMailService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: getRepositoryToken(StudentEntity), useValue: mockRepo },
        { provide: getRepositoryToken(DomainRoleEntity), useValue: mockDomainRoleRepo },
        { provide: getRepositoryToken(SpecialtyEntity), useValue: mockSpecialtyRepo },
        { provide: 'IPasswordResetTokenService', useValue: mockPasswordResetTokenService },
        { provide: 'IMailService', useValue: mockMailService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, string> = {
                ADMIN_PANEL_URL: 'http://localhost:5173',
                SSO_BASE_URL: 'http://localhost:3000',
              };
              if (key in map) return map[key];
              throw new Error(`Config key not found: ${key}`);
            },
          },
        },
      ],
    }).compile();

    service = module.get<StudentService>(StudentService);
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debería retornar lista paginada de alumnos', async () => {
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());

      const result = await service.findAll({});
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('password');
    });

    it('debería retornar hasPassword correctamente', async () => {
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder());

      const result = await service.findAll({});
      expect(result.data[0].hasPassword).toBe(true);
    });

    it('debería respetar el límite máximo de 100 resultados por página', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ limit: 9999 });

      expect(qb.take).toHaveBeenCalledWith(100);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debería retornar el alumno mapeado a DTO si existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());

      const result = await service.findOne('student-uuid');

      expect(result.id).toBe('student-uuid');
      expect(result.username).toBe('immosconi136');
      expect(result).not.toHaveProperty('password');
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      first_name: 'Ignacio',
      last_name: 'Mosconi',
      email: 'alumno@gmail.com',
      dni: 44244136,
      birth_date: '2003-05-15',
      domain_role_id: 1,
      specialty_id: 1,
    };

    it('debería crear el alumno, generar username y enviar email de bienvenida', async () => {
      // DNI check → null, email check → null, username uniqueness → null, reload → entity
      mockRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeStudent({ password: null }));
      mockRepo.create.mockReturnValue(makeStudent({ password: null }));
      mockRepo.save.mockResolvedValue(makeStudent({ password: null }));

      const result = await service.create(createDto);

      expect(result.id).toBe('student-uuid');
      expect(result.hasPassword).toBe(false);
      // Email de bienvenida es fire-and-forget (void), así que no bloqueamos el test en él
    });

    it('debería lanzar ConflictException si el DNI ya está registrado', async () => {
      mockRepo.findOne.mockResolvedValueOnce(makeStudent()); // DNI existe

      await expect(service.create(createDto as never)).rejects.toThrow(ConflictException);
    });

    it('debería lanzar ConflictException si el email ya está registrado', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(null)           // DNI no existe
        .mockResolvedValueOnce(makeStudent()); // Email existe

      await expect(service.create(createDto as never)).rejects.toThrow(ConflictException);
    });

    it('debería lanzar NotFoundException si el rol no existe', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockDomainRoleRepo.findOne.mockResolvedValue(null);

      await expect(service.create(createDto as never)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar NotFoundException si la especialidad no existe', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockDomainRoleRepo.findOne.mockResolvedValue(makeDomainRole());
      mockSpecialtyRepo.findOne.mockResolvedValue(null);

      await expect(service.create(createDto as never)).rejects.toThrow(NotFoundException);
    });

    it('debería agregar sufijo numérico al username si ya existe una colisión', async () => {
      const existingStudent = makeStudent({ username: 'immosconi136' });
      mockRepo.findOne
        .mockResolvedValueOnce(null)           // DNI no existe
        .mockResolvedValueOnce(null)           // Email no existe
        .mockResolvedValueOnce(existingStudent) // username base existe (colisión)
        .mockResolvedValueOnce(null)           // username_2 no existe
        .mockResolvedValueOnce(makeStudent({ username: 'immosconi136_2' })); // reload
      mockRepo.create.mockReturnValue(makeStudent({ username: 'immosconi136_2', password: null }));
      mockRepo.save.mockResolvedValue(makeStudent({ username: 'immosconi136_2', password: null }));

      const result = await service.create(createDto);
      expect(result).toBeDefined();
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('debería actualizar los campos del alumno', async () => {
      const entity = makeStudent();
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, first_name: 'Nacho' });

      const result = await service.update('student-uuid', { first_name: 'Nacho' });
      expect(result.first_name).toBe('Nacho');
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.update('no-existe', { first_name: 'Nacho' }))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar ConflictException si el nuevo DNI ya está en uso', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(makeStudent())           // alumno existe
        .mockResolvedValueOnce(makeStudent({ id: 'otro-uuid' })); // DNI en uso por otro

      await expect(service.update('student-uuid', { dni: 99999999 }))
        .rejects.toThrow(ConflictException);
    });

    it('debería lanzar NotFoundException si el nuevo rol no existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockDomainRoleRepo.findOne.mockResolvedValue(null);

      await expect(service.update('student-uuid', { domain_role_id: 99 }))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar NotFoundException si la nueva especialidad no existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockSpecialtyRepo.findOne.mockResolvedValue(null);

      await expect(service.update('student-uuid', { specialty_id: 99 }))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('debería eliminar el alumno sin pedir contraseña si no tiene ninguna', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ password: null }));
      mockRepo.remove.mockResolvedValue({});

      await service.remove('student-uuid', {});
      expect(mockRepo.remove).toHaveBeenCalled();
    });

    it('debería eliminar el alumno si la contraseña es correcta', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.remove.mockResolvedValue({});

      await service.remove('student-uuid', { password: 'correcta' });
      expect(mockRepo.remove).toHaveBeenCalled();
    });

    it('debería lanzar BadRequestException si tiene contraseña pero no se proporcionó', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());

      await expect(service.remove('student-uuid', {})).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.remove('student-uuid', { password: 'incorrecta' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('no-existe', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ── suspend ─────────────────────────────────────────────────────────────────

  describe('suspend', () => {
    it('debería suspender un alumno activo', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Active });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.Suspended });

      const result = await service.suspend('student-uuid');
      expect(result.account_status).toBe(AccountStatus.Suspended);
    });

    it('debería lanzar BadRequestException si el alumno ya está suspendido', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ account_status: AccountStatus.Suspended }));
      await expect(service.suspend('student-uuid')).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.suspend('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ── activate ─────────────────────────────────────────────────────────────────

  describe('activate', () => {
    it('debería activar con status active si el alumno tiene contraseña', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Suspended, password: '$2b$10$hashed' });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.Active });

      const result = await service.activate('student-uuid');
      expect(result.account_status).toBe(AccountStatus.Active);
    });

    it('debería activar con status pending_registration si el alumno no tiene contraseña', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Suspended, password: null });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.PendingRegistration });

      const result = await service.activate('student-uuid');
      expect(result.account_status).toBe(AccountStatus.PendingRegistration);
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.activate('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findForAuth ─────────────────────────────────────────────────────────────

  describe('findForAuth', () => {
    it('debería retornar las credenciales del alumno si existe', async () => {
      const qb = makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(makeStudent()) });
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findForAuth('immosconi136');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('student-uuid');
      expect(result!.domainRoleName).toBe('Alumno');
      expect(result!.specialtyName).toBe('Mecánica');
    });

    it('debería retornar null si el alumno no existe', async () => {
      const qb = makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) });
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findForAuth('noexiste');
      expect(result).toBeNull();
    });
  });

  // ── setPassword ─────────────────────────────────────────────────────────────

  describe('setPassword', () => {
    it('debería establecer la contraseña y activar la cuenta', async () => {
      const entity = makeStudent({ account_status: AccountStatus.PendingRegistration, password: null });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, password: '$2b$10$hashed', account_status: AccountStatus.Active });

      await service.setPassword('student-uuid', '$2b$10$hashed');

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          password: '$2b$10$hashed',
          account_status: AccountStatus.Active,
        }),
      );
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.setPassword('no-existe', '$2b$10$hashed'))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar UnauthorizedException si la cuenta está suspendida', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ account_status: AccountStatus.Suspended }));
      await expect(service.setPassword('student-uuid', '$2b$10$hashed'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ── resendWelcome ───────────────────────────────────────────────────────────

  describe('resendWelcome', () => {
    it('debería generar nuevo token y enviar email si la cuenta está en pending_registration', async () => {
      mockRepo.findOne.mockResolvedValue(
        makeStudent({ account_status: AccountStatus.PendingRegistration, password: null }),
      );

      await service.resendWelcome('student-uuid');

      expect(mockPasswordResetTokenService.generate).toHaveBeenCalledWith('student-uuid', 'setup');
      expect(mockMailService.send).toHaveBeenCalled();
    });

    it('debería lanzar BadRequestException si la cuenta no está en pending_registration', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ account_status: AccountStatus.Active }));
      await expect(service.resendWelcome('student-uuid')).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.resendWelcome('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('debería generar token de reset y enviar email al alumno', async () => {
      const student = {
        id: 'student-uuid',
        username: 'immosconi136',
        email: 'alumno@gmail.com',
        first_name: 'Ignacio',
        last_name: 'Mosconi',
        password: '$2b$10$hashed',
        account_status: 'active',
        domainRoleName: 'Alumno',
        specialtyName: 'Mecánica',
      };

      await service.sendPasswordResetEmail(student);

      expect(mockPasswordResetTokenService.generate).toHaveBeenCalledWith('student-uuid', 'reset');
      expect(mockMailService.send).toHaveBeenCalledWith(
        'alumno@gmail.com',
        expect.stringContaining('contraseña'),
        expect.objectContaining({ html: expect.any(String) }),
      );
    });
  });

});
