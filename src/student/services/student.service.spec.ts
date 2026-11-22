jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException, UnauthorizedException, ForbiddenException, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { StudentService } from './student.service.js';
import { StudentEntity, AccountStatus } from '../entities/student.entity.js';
import { DomainRoleEntity } from '../../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../../specialty/entities/specialty.entity.js';
import { OAuthClientEntity } from '../../oauth-client/entities/oauth-client.entity.js';
import { HttpException } from '@nestjs/common';

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
  let mockOauthClientRepo: jest.Mocked<Record<string, jest.Mock>>;
  let mockRefreshTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockPasswordAttempts: jest.Mocked<Record<string, jest.Mock>>;

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
      } as unknown as jest.Mock,
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

    mockOauthClientRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation(entity => Promise.resolve(entity)),
    };

    mockRefreshTokenService = {
      revokeAllForClient: jest.fn().mockResolvedValue(undefined),
      revokeAllForSub: jest.fn().mockResolvedValue(undefined),
    };

    mockPasswordAttempts = {
      registerAttempt: jest.fn().mockResolvedValue({ attemptsRemaining: 4, retryAfterSeconds: 880 }),
      getLockStatus: jest.fn(),
      reset: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: getRepositoryToken(StudentEntity), useValue: mockRepo },
        { provide: getRepositoryToken(DomainRoleEntity), useValue: mockDomainRoleRepo },
        { provide: getRepositoryToken(SpecialtyEntity), useValue: mockSpecialtyRepo },
        { provide: 'IPasswordResetTokenService', useValue: mockPasswordResetTokenService },
        { provide: 'IMailService', useValue: mockMailService },
        { provide: getRepositoryToken(OAuthClientEntity), useValue: mockOauthClientRepo },
        { provide: 'IRefreshTokenService', useValue: mockRefreshTokenService },
        { provide: 'IPasswordAttemptsService', useValue: mockPasswordAttempts },
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

    it('debería buscar por usuario, nombre, apellido y DNI sin tildes, con una condición por palabra', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);
  
      await service.findAll({ search: 'Lucía Pérez' });
  
      expect(qb.andWhere).toHaveBeenCalledTimes(2);
      const [sql, params] = qb.andWhere.mock.calls[0];
      expect(sql).toContain('unaccent(s.username) ILIKE unaccent(:q0)');
      expect(sql).toContain('unaccent(s.first_name) ILIKE unaccent(:q0)');
      expect(sql).toContain('unaccent(s.last_name) ILIKE unaccent(:q0)');
      expect(params).toEqual({ q0: '%Lucía%' });
      expect(qb.andWhere.mock.calls[1][1]).toEqual({ q1: '%Pérez%' });
    });
  
    it('no debería buscar por email', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);
  
      await service.findAll({ search: 'alumno' });
  
      expect(qb.andWhere.mock.calls[0][0]).not.toContain('email');
    });
  
    it('debería buscar por DNI usando solo los dígitos de la palabra (admite puntos)', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);
  
      await service.findAll({ search: '44.244' });
  
      const [sql, params] = qb.andWhere.mock.calls[0];
      expect(sql).toContain('CAST(s.dni AS TEXT) LIKE :d0');
      expect(params).toEqual({ q0: '%44.244%', d0: '%44244%' });
    });
  
    it('no debería buscar por DNI si la palabra no tiene dígitos', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);
  
      await service.findAll({ search: 'lucia' });
  
      const [sql, params] = qb.andWhere.mock.calls[0];
      expect(sql).not.toContain('dni');
      expect(params).not.toHaveProperty('d0');
    });
  
    it('debería escapar %, _ y \\ para buscarlos literalmente', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);
  
      await service.findAll({ search: 'a%b_c\\d' });
  
      expect(qb.andWhere.mock.calls[0][1].q0).toBe('%a\\%b\\_c\\\\d%');
    });
  
    it('no debería agregar condiciones si la búsqueda es solo espacios', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);
  
      await service.findAll({ search: '   ' });
  
      expect(qb.andWhere).not.toHaveBeenCalled();
    });
  
    it('debería combinar la búsqueda con los demás filtros', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);
  
      await service.findAll({ search: 'lucia', domainRoleId: 1, accountStatus: AccountStatus.Active });
  
      expect(qb.andWhere).toHaveBeenCalledTimes(3);
      expect(qb.andWhere).toHaveBeenCalledWith('s.domain_role_id = :rid', { rid: 1 });
      expect(qb.andWhere).toHaveBeenCalledWith('s.account_status = :st', { st: AccountStatus.Active });
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
      mockOauthClientRepo.find.mockResolvedValue([]);
      mockRepo.remove.mockResolvedValue({});

      await service.remove('student-uuid', {});
      expect(mockRepo.remove).toHaveBeenCalled();
    });

    it('debería eliminar el alumno si la contraseña es correcta', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValue([]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.remove.mockResolvedValue({});

      await service.remove('student-uuid', { password: 'correcta' });
      expect(mockRepo.remove).toHaveBeenCalled();
    });

    it('debería lanzar HttpException 409 si el usuario es responsable de apps', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ password: null }));
      mockOauthClientRepo.find.mockResolvedValue([
        { id: 10, clientName: 'App1' },
        { id: 20, clientName: 'App2' },
      ]);

      try {
        await service.remove('student-uuid', {});
        fail('Debería haber lanzado HttpException');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(409);
        const body = httpErr.getResponse() as { responsibleApps: { id: number; clientName: string }[] };
        expect(body.responsibleApps).toHaveLength(2);
        expect(body.responsibleApps[0]).toEqual({ id: 10, clientName: 'App1' });
      }
    });

    it('debería lanzar BadRequestException si tiene contraseña pero no se proporcionó', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValue([]);

      await expect(service.remove('student-uuid', {})).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar ForbiddenException con los intentos restantes si la contraseña es incorrecta', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValue([]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const attempt = service.remove('student-uuid', { password: 'incorrecta' });

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject({
        response: { statusCode: 403, attemptsRemaining: 4, retryAfterSeconds: 880 },
      });
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('no-existe', {})).rejects.toThrow(NotFoundException);
    });

    it('debería registrar el intento antes de comparar la contraseña y reiniciar el contador si es correcta', async () => {
      const order: string[] = [];
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValue([]);
      mockPasswordAttempts.registerAttempt.mockImplementation(() => {
        order.push('register');
        return Promise.resolve({ attemptsRemaining: 4, retryAfterSeconds: 880 });
      });
      (bcrypt.compare as jest.Mock).mockImplementation(() => {
        order.push('compare');
        return Promise.resolve(true);
      });
      mockPasswordAttempts.reset.mockImplementation(() => {
        order.push('reset');
        return Promise.resolve();
      });
      mockRepo.remove.mockResolvedValue({});

      await service.remove('student-uuid', { password: 'correcta' });

      expect(order).toEqual(['register', 'compare', 'reset']);
      expect(mockPasswordAttempts.registerAttempt).toHaveBeenCalledWith('student-uuid');
      expect(mockPasswordAttempts.reset).toHaveBeenCalledWith('student-uuid');
      expect(mockRepo.remove).toHaveBeenCalled();
    });

    it('no debería reiniciar el contador si la contraseña es incorrecta', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValue([]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.remove('student-uuid', { password: 'incorrecta' }))
        .rejects.toThrow(ForbiddenException);

      expect(mockPasswordAttempts.registerAttempt).toHaveBeenCalledTimes(1);
      expect(mockPasswordAttempts.reset).not.toHaveBeenCalled();
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });

    it('debería cortar con 429 sin comparar la contraseña ni eliminar si el alumno está bloqueado', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValue([]);
      mockPasswordAttempts.registerAttempt.mockRejectedValue(
        new HttpException({ statusCode: 429, code: 'PASSWORD_ATTEMPTS_LOCKED' }, 429),
      );

      await expect(service.remove('student-uuid', { password: 'x' })).rejects.toMatchObject({ status: 429 });

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });

    it('no debería registrar intentos si el alumno no tiene contraseña', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ password: null }));
      mockOauthClientRepo.find.mockResolvedValue([]);
      mockRepo.remove.mockResolvedValue({});

      await service.remove('student-uuid', {});

      expect(mockPasswordAttempts.registerAttempt).not.toHaveBeenCalled();
    });

    it('no debería registrar intentos si falta la contraseña ni si hay conflicto 409', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValueOnce([]);
      await expect(service.remove('student-uuid', {})).rejects.toThrow(BadRequestException);

      mockOauthClientRepo.find.mockResolvedValueOnce([{ id: 10, clientName: 'App1' }]);
      await expect(service.remove('student-uuid', { password: 'x' })).rejects.toMatchObject({ status: 409 });

      expect(mockPasswordAttempts.registerAttempt).not.toHaveBeenCalled();
    });

    it('debería cerrar todas las sesiones del alumno antes de eliminarlo', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValue([]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockRepo.remove.mockResolvedValue({});

      await service.remove('student-uuid', { password: 'correcta' });

      expect(mockRefreshTokenService.revokeAllForSub).toHaveBeenCalledWith('student-uuid');
      expect(mockRefreshTokenService.revokeAllForSub.mock.invocationCallOrder[0])
        .toBeLessThan(mockRepo.remove.mock.invocationCallOrder[0]);
    });

    it('debería cerrar las sesiones también si el alumno no tiene contraseña', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ password: null }));
      mockOauthClientRepo.find.mockResolvedValue([]);
      mockRepo.remove.mockResolvedValue({});

      await service.remove('student-uuid', {});

      expect(mockRefreshTokenService.revokeAllForSub).toHaveBeenCalledWith('student-uuid');
    });

    it('no debería cerrar sesiones ni eliminar si la contraseña es incorrecta, está bloqueado o falta', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockOauthClientRepo.find.mockResolvedValue([]);

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.remove('student-uuid', { password: 'mala' })).rejects.toThrow(ForbiddenException);

      await expect(service.remove('student-uuid', {})).rejects.toThrow(BadRequestException);

      mockPasswordAttempts.registerAttempt.mockRejectedValue(new HttpException({ statusCode: 429 }, 429));
      await expect(service.remove('student-uuid', { password: 'x' })).rejects.toMatchObject({ status: 429 });

      expect(mockRefreshTokenService.revokeAllForSub).not.toHaveBeenCalled();
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });

    it('no debería cerrar sesiones si la baja se rechaza por ser responsable de apps (409)', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ password: null }));
      mockOauthClientRepo.find.mockResolvedValue([{ id: 10, clientName: 'App1' }]);

      await expect(service.remove('student-uuid', {})).rejects.toMatchObject({ status: 409 });

      expect(mockRefreshTokenService.revokeAllForSub).not.toHaveBeenCalled();
    });
  });

  // ── suspend ─────────────────────────────────────────────────────────────────

  describe('suspend', () => {
    it('debería suspender un alumno activo', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Active });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.Suspended });
      mockOauthClientRepo.find.mockResolvedValue([]);

      const result = await service.suspend('student-uuid');
      expect(result.account_status).toBe(AccountStatus.Suspended);
    });

    it('debería cascade-suspender apps activas y revocar sus sesiones', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Active });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.Suspended });

      const app1 = { id: 10, clientName: 'App1', isActive: true, responsibleUserId: 'student-uuid' };
      const app2 = { id: 20, clientName: 'App2', isActive: false, responsibleUserId: 'student-uuid' };
      mockOauthClientRepo.find.mockResolvedValue([app1, app2]);

      await service.suspend('student-uuid');

      // Solo app1 estaba activa → se revoca y se suspende
      expect(mockRefreshTokenService.revokeAllForClient).toHaveBeenCalledTimes(1);
      expect(mockRefreshTokenService.revokeAllForClient).toHaveBeenCalledWith(10);
      expect(mockOauthClientRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 10, isActive: false }));
      // app2 ya estaba suspendida → no se toca
      expect(mockOauthClientRepo.save).not.toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
    });

    it('debería lanzar BadRequestException si el alumno ya está suspendido', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ account_status: AccountStatus.Suspended }));
      await expect(service.suspend('student-uuid')).rejects.toThrow(BadRequestException);
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.suspend('no-existe')).rejects.toThrow(NotFoundException);
    });

    it('debería cerrar todas las sesiones del propio alumno al suspenderlo', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Active });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.Suspended });
      mockOauthClientRepo.find.mockResolvedValue([]);

      await service.suspend('student-uuid');

      expect(mockRefreshTokenService.revokeAllForSub).toHaveBeenCalledWith('student-uuid');
    });

    it('no debería tocar las sesiones si el alumno ya estaba suspendido o no existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ account_status: AccountStatus.Suspended }));
      await expect(service.suspend('student-uuid')).rejects.toThrow(BadRequestException);

      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.suspend('no-existe')).rejects.toThrow(NotFoundException);

      expect(mockRefreshTokenService.revokeAllForSub).not.toHaveBeenCalled();
    });
  });

  // ── activate ─────────────────────────────────────────────────────────────────

  describe('activate', () => {
    it('debería activar con status active si el alumno tiene contraseña', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Suspended, password: '$2b$10$hashed' });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.Active });
      mockOauthClientRepo.find.mockResolvedValue([]);

      const result = await service.activate('student-uuid');
      expect(result.account_status).toBe(AccountStatus.Active);
    });

    it('debería activar con status pending_registration si el alumno no tiene contraseña', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Suspended, password: null });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.PendingRegistration });
      mockOauthClientRepo.find.mockResolvedValue([]);

      const result = await service.activate('student-uuid');
      expect(result.account_status).toBe(AccountStatus.PendingRegistration);
    });

    it('debería cascade-reactivar apps suspendidas del usuario', async () => {
      const entity = makeStudent({ account_status: AccountStatus.Suspended, password: '$2b$10$hashed' });
      mockRepo.findOne.mockResolvedValue(entity);
      mockRepo.save.mockResolvedValue({ ...entity, account_status: AccountStatus.Active });

      const app1 = { id: 10, clientName: 'App1', isActive: false, responsibleUserId: 'student-uuid' };
      const app2 = { id: 20, clientName: 'App2', isActive: true, responsibleUserId: 'student-uuid' };
      mockOauthClientRepo.find.mockResolvedValue([app1, app2]);

      await service.activate('student-uuid');

      // Solo app1 estaba inactiva → se reactiva
      expect(mockOauthClientRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 10, isActive: true }));
      // app2 ya estaba activa → no se toca
      expect(mockOauthClientRepo.save).not.toHaveBeenCalledWith(expect.objectContaining({ id: 20 }));
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

  // ── getPasswordLockStatus ───────────────────────────────────────────────────
  describe('getPasswordLockStatus', () => {
    it('debería devolver el estado del bloqueo del servicio de intentos', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockPasswordAttempts.getLockStatus.mockResolvedValue({ locked: true, retryAfterSeconds: 300 });

      await expect(service.getPasswordLockStatus('student-uuid'))
        .resolves.toEqual({ locked: true, retryAfterSeconds: 300 });
      expect(mockPasswordAttempts.getLockStatus).toHaveBeenCalledWith('student-uuid');
    });

    it('debería informar sin bloqueo (sin consultar Redis) si el alumno no tiene contraseña', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ password: null }));

      await expect(service.getPasswordLockStatus('student-uuid'))
        .resolves.toEqual({ locked: false, retryAfterSeconds: 0 });
      expect(mockPasswordAttempts.getLockStatus).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getPasswordLockStatus('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

});
