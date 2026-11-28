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
import { DomainRoleEntity } from '../../../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../../../specialty/entities/specialty.entity.js';
import { OAuthClientEntity } from '../../../oauth-client/entities/oauth-client.entity.js';
import { HttpException } from '@nestjs/common';
import * as XLSX from 'xlsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDomainRole(overrides: Partial<DomainRoleEntity> = {}): DomainRoleEntity {
  return { id: 1, name: 'Alumno', exclusive: false, singleSpecialty: false, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

function makeSpecialty(overrides: Partial<SpecialtyEntity> = {}): SpecialtyEntity {
  return { id: 1, name: 'Mecánica', createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

function makeStudent(overrides: Partial<StudentEntity> = {}): StudentEntity {
  return {
    id: 'student-uuid',
    first_name: 'Ignacio',
    last_name: 'Mosconi',
    username: 'immosconi456',
    email: 'alumno@gmail.com',
    password: '$2b$10$hashed',
    dni: 30123456,
    birth_date: new Date('2003-05-15'),
    account_status: AccountStatus.Active,
    domainRoles: [makeDomainRole()],
    specialties: [makeSpecialty()],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeQueryBuilder(overrides: Record<string, jest.Mock> = {}) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
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
  let mockAdminPasswordConfirm: jest.Mocked<Record<string, jest.Mock>>;

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
      invalidateAllForStudent: jest.fn().mockResolvedValue(undefined),
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

    mockAdminPasswordConfirm = {
      verify: jest.fn().mockResolvedValue(undefined),
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
        { provide: 'IAdminPasswordConfirmService', useValue: mockAdminPasswordConfirm },
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
    it('filtra por cargo/especialidad con EXISTS (el usuario sigue trayendo TODOS sus cargos)', async () => {
      const qb = makeQueryBuilder();
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ domainRoleId: 2, specialtyId: 5 });

      const calls = qb.andWhere.mock.calls as [string, Record<string, number>][];
      expect(calls[0][0]).toContain('EXISTS (SELECT 1 FROM student_domain_roles');
      expect(calls[0][1]).toEqual({ rid: 2 });
      expect(calls[1][0]).toContain('EXISTS (SELECT 1 FROM student_specialties');
      expect(calls[1][1]).toEqual({ sid: 5 });
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('s.domainRoles', 'dr');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('s.specialties', 'sp');
    });

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
  
      await service.findAll({ search: '30.123' });
  
      const [sql, params] = qb.andWhere.mock.calls[0];
      expect(sql).toContain('CAST(s.dni AS TEXT) LIKE :d0');
      expect(params).toEqual({ q0: '%30.123%', d0: '%30123%' });
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
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('student_domain_roles'), { rid: 1 });
      expect(qb.andWhere).toHaveBeenCalledWith('s.account_status = :st', { st: AccountStatus.Active });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debería retornar el alumno mapeado a DTO si existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());

      const result = await service.findOne('student-uuid');

      expect(result.id).toBe('student-uuid');
      expect(result.username).toBe('immosconi456');
      expect(result).not.toHaveProperty('password');
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    beforeEach(() => {
      // Por defecto el email no está registrado
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) }));
    });

    const createDto = {
      first_name: 'Ignacio',
      last_name: 'Mosconi',
      email: 'alumno@gmail.com',
      dni: 30123456,
      birth_date: '2003-05-15',
      domain_role_ids: [1],
      specialty_ids: [1],
    };

    it('N4: si el SMTP falla, create no tira ni deja una promesa sin capturar', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeStudent({ password: null }));
      mockRepo.create.mockReturnValue(makeStudent({ password: null }));
      mockRepo.save.mockResolvedValue(makeStudent({ password: null }));
      mockMailService.send.mockRejectedValue(new Error('SMTP caído'));
      const unhandled = jest.fn();
      process.once('unhandledRejection', unhandled);

      await expect(service.create(createDto)).resolves.toBeDefined();
      await new Promise((r) => setTimeout(r, 20));

      expect(unhandled).not.toHaveBeenCalled();
      process.removeListener('unhandledRejection', unhandled);
    });

    it('debería crear el alumno, generar username y enviar email de bienvenida', async () => {
      // DNI check → null, email check → null, username uniqueness → null, reload → entity
      mockRepo.findOne
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
      mockRepo.findOne.mockResolvedValueOnce(null); // DNI no existe
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder()); // Email existe (getOne devuelve un alumno)

      await expect(service.create(createDto as never)).rejects.toThrow(ConflictException);
    });

    it('debería lanzar NotFoundException si el cargo no existe', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) }));
      mockDomainRoleRepo.find.mockResolvedValue([]);

      await expect(service.create(createDto as never)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar NotFoundException si la especialidad no existe', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) }));
      mockSpecialtyRepo.find.mockResolvedValue([]);

      await expect(service.create(createDto as never)).rejects.toThrow(NotFoundException);
    });

    describe('cargos y especialidades múltiples', () => {
      const profesor = makeDomainRole({ id: 2, name: 'Profesor' });
      const preceptor = makeDomainRole({ id: 3, name: 'Preceptor' });
      const alumno = makeDomainRole({ id: 1, name: 'Alumno', exclusive: true, singleSpecialty: true });
      const mecanica = makeSpecialty({ id: 1, name: 'Mecánica' });
      const electronica = makeSpecialty({ id: 2, name: 'Electrónica' });

      beforeEach(() => {
        mockRepo.findOne.mockResolvedValue(null);
        mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) }));
        mockRepo.create.mockImplementation((e: unknown) => e);
        mockRepo.save.mockImplementation((e: unknown) => Promise.resolve({ ...(e as object), id: 'nuevo' }));
      });

      it('guarda TODOS los cargos y especialidades indicados (ordenados) y no consulta de a uno', async () => {
        mockDomainRoleRepo.find.mockResolvedValue([profesor, preceptor]);
        mockSpecialtyRepo.find.mockResolvedValue([mecanica, electronica]);
        // recarga final
        mockRepo.findOne
          .mockResolvedValueOnce(null).mockResolvedValueOnce(null)
          .mockResolvedValueOnce(makeStudent({ domainRoles: [profesor, preceptor], specialties: [mecanica, electronica] }));

        const result = await service.create({ ...createDto, domain_role_ids: [2, 3], specialty_ids: [1, 2] });

        const created = mockRepo.create.mock.calls[0][0] as { domainRoles: { id: number }[]; specialties: { id: number }[] };
        expect(created.domainRoles.map(r => r.id)).toEqual([3, 2]); // Preceptor, Profesor
        expect(created.specialties.map(sp => sp.id)).toEqual([2, 1]); // Electrónica, Mecánica
        expect(result.domainRoles.map(r => r.name)).toEqual(['Preceptor', 'Profesor']);
        expect(result.specialties.map(sp => sp.name)).toEqual(['Electrónica', 'Mecánica']);
        expect(mockDomainRoleRepo.findOne).not.toHaveBeenCalled();
      });

      it('rechaza con 400 un cargo que no se combina junto a otro, sin crear nada', async () => {
        mockDomainRoleRepo.find.mockResolvedValue([alumno, profesor]);
        mockSpecialtyRepo.find.mockResolvedValue([mecanica]);

        const err = await service.create({ ...createDto, domain_role_ids: [1, 2], specialty_ids: [1] }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          message: ['El cargo "Alumno" no se puede combinar con otros cargos.'],
        });
        expect(mockRepo.save).not.toHaveBeenCalled();
        expect(mockMailService.send).not.toHaveBeenCalled();
      });

      it('rechaza con 400 dos especialidades si alguno de los cargos exige exactamente una', async () => {
        const unaSola = makeDomainRole({ id: 4, name: 'Regente', singleSpecialty: true });
        mockDomainRoleRepo.find.mockResolvedValue([profesor, unaSola]);
        mockSpecialtyRepo.find.mockResolvedValue([mecanica, electronica]);

        await expect(service.create({ ...createDto, domain_role_ids: [2, 4], specialty_ids: [1, 2] }))
          .rejects.toThrow(BadRequestException);
        expect(mockRepo.save).not.toHaveBeenCalled();
      });

      it('informa todos los ids inexistentes en el 404', async () => {
        mockDomainRoleRepo.find.mockResolvedValue([profesor]);
        await expect(service.create({ ...createDto, domain_role_ids: [2, 98, 99], specialty_ids: [1] }))
          .rejects.toThrow('Cargo(s) con id 98, 99 no encontrado(s).');
      });
    });

    it('debería agregar sufijo numérico al username si ya existe una colisión', async () => {
      const existingStudent = makeStudent({ username: 'immosconi456' });
      mockRepo.findOne
        .mockResolvedValueOnce(null)           // DNI no existe
        .mockResolvedValueOnce(existingStudent) // username base existe (colisión)
        .mockResolvedValueOnce(null)           // username_2 no existe
        .mockResolvedValueOnce(makeStudent({ username: 'immosconi456_2' })); // reload
      mockRepo.create.mockReturnValue(makeStudent({ username: 'immosconi456_2', password: null }));
      mockRepo.save.mockResolvedValue(makeStudent({ username: 'immosconi456_2', password: null }));

      const result = await service.create(createDto);
      expect(result).toBeDefined();
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    const profesor = makeDomainRole({ id: 2, name: 'Profesor' });
    const preceptor = makeDomainRole({ id: 3, name: 'Preceptor' });
    const alumno = makeDomainRole({ id: 1, name: 'Alumno', exclusive: true, singleSpecialty: true });
    const mecanica = makeSpecialty({ id: 1, name: 'Mecánica' });
    const electronica = makeSpecialty({ id: 2, name: 'Electrónica' });
    const pw = { admin_password: 'admin-pass' };

    beforeEach(() => {
      mockRepo.save.mockImplementation((e: unknown) => Promise.resolve(e));
    });

    it('debería actualizar los campos del alumno', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());

      const result = await service.update('student-uuid', { first_name: 'Nacho', ...pw }, 'admin-1');
      expect(result.first_name).toBe('Nacho');
    });

    it('verifica la contraseña del admin que edita ANTES de leer o tocar al usuario', async () => {
      mockAdminPasswordConfirm.verify.mockRejectedValue(new ForbiddenException('Tu contraseña de administrador es incorrecta.'));

      await expect(service.update('student-uuid', { first_name: 'Nacho', ...pw }, 'admin-1')).rejects.toThrow(ForbiddenException);
      expect(mockAdminPasswordConfirm.verify).toHaveBeenCalledWith('admin-1', 'admin-pass');
      expect(mockRepo.findOne).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(mockMailService.send).not.toHaveBeenCalled();
    });

    it('rechaza con 400 un pedido sin ningún campo a cambiar (sin gastar un intento de contraseña)', async () => {
      await expect(service.update('student-uuid', { ...pw }, 'admin-1')).rejects.toThrow(BadRequestException);
      expect(mockAdminPasswordConfirm.verify).not.toHaveBeenCalled();
    });

    it('rechaza con 400 si los datos enviados son iguales a los actuales y no manda mail', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      await expect(service.update('student-uuid', { first_name: 'Ignacio', ...pw }, 'admin-1'))
        .rejects.toThrow('No hay cambios');
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(mockMailService.send).not.toHaveBeenCalled();
    });

    it('reemplaza la lista completa de cargos y especialidades', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockDomainRoleRepo.find.mockResolvedValue([profesor, preceptor]);
      mockSpecialtyRepo.find.mockResolvedValue([mecanica, electronica]);

      const result = await service.update('student-uuid', { domain_role_ids: [2, 3], specialty_ids: [1, 2], ...pw }, 'admin-1');

      const saved = mockRepo.save.mock.calls[0][0] as StudentEntity;
      expect(saved.domainRoles).toEqual([preceptor, profesor]);
      expect(saved.specialties).toEqual([electronica, mecanica]);
      expect(result.domainRoles.map(r => r.name)).toEqual(['Preceptor', 'Profesor']);
    });

    it('valida la combinación FINAL: cambiar solo las especialidades respeta la regla de los cargos que conserva', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ domainRoles: [alumno] }));
      mockDomainRoleRepo.find.mockResolvedValue([alumno]);
      mockSpecialtyRepo.find.mockResolvedValue([mecanica, electronica]);

      await expect(service.update('student-uuid', { specialty_ids: [1, 2], ...pw }, 'admin-1'))
        .rejects.toThrow(BadRequestException);
      expect(mockDomainRoleRepo.find).toHaveBeenCalledWith({ where: { id: expect.anything() } });
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('rechaza agregar un cargo a alguien que tiene un cargo que no se combina', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ domainRoles: [alumno] }));
      mockDomainRoleRepo.find.mockResolvedValue([alumno, profesor]);
      mockSpecialtyRepo.find.mockResolvedValue([mecanica]);

      await expect(service.update('student-uuid', { domain_role_ids: [1, 2], ...pw }, 'admin-1'))
        .rejects.toThrow(BadRequestException);
    });

    it('manda un mail al usuario con el antes y el después de lo que cambió', async () => {
      mockRepo.findOne.mockResolvedValueOnce(makeStudent()).mockResolvedValueOnce(null); // usuario, DNI libre
      mockDomainRoleRepo.find.mockResolvedValue([profesor, preceptor]);
      mockSpecialtyRepo.find.mockResolvedValue([mecanica]);

      await service.update('student-uuid', { domain_role_ids: [2, 3], dni: 30123457, ...pw }, 'admin-1');
      await new Promise(r => setImmediate(r));

      expect(mockMailService.send).toHaveBeenCalledTimes(1);
      const [to, subject, { html }] = mockMailService.send.mock.calls[0] as [string, string, { html: string }];
      expect(to).toBe('alumno@gmail.com');
      expect(subject).toBe('Se modificaron tus datos en ITAPU');
      expect(html).toContain('Cargos');
      expect(html).toContain('Alumno');
      expect(html).toContain('Preceptor, Profesor');
      expect(html).toContain('30123456');
      expect(html).toContain('30123457');
      expect(html).not.toContain('Especialidades'); // no cambiaron
    });

    it('escapa el HTML de los datos en el mail', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent({ first_name: '<b>x</b>' }));
      await service.update('student-uuid', { first_name: 'Nacho', ...pw }, 'admin-1');
      await new Promise(r => setImmediate(r));
      const { html } = mockMailService.send.mock.calls[0][2] as { html: string };
      expect(html).not.toContain('<b>x</b>');
      expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    });

    it('si el SMTP falla, la edición se guarda igual y no queda una promesa sin capturar', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockMailService.send.mockRejectedValue(new Error('SMTP caído'));
      const unhandled = jest.fn();
      process.once('unhandledRejection', unhandled);

      await expect(service.update('student-uuid', { last_name: 'Otro', ...pw }, 'admin-1')).resolves.toBeDefined();
      await new Promise(r => setTimeout(r, 20));
      expect(unhandled).not.toHaveBeenCalled();
      process.removeListener('unhandledRejection', unhandled);
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.update('no-existe', { first_name: 'Nacho', ...pw }, 'admin-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar ConflictException si el nuevo DNI ya está en uso', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(makeStudent())           // alumno existe
        .mockResolvedValueOnce(makeStudent({ id: 'otro-uuid' })); // DNI en uso por otro

      await expect(service.update('student-uuid', { dni: 99999999, ...pw }, 'admin-1'))
        .rejects.toThrow(ConflictException);
    });

    it('debería lanzar NotFoundException si el nuevo cargo no existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockDomainRoleRepo.find.mockResolvedValue([]);

      await expect(service.update('student-uuid', { domain_role_ids: [99], ...pw }, 'admin-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar NotFoundException si la nueva especialidad no existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeStudent());
      mockSpecialtyRepo.find.mockResolvedValue([]);

      await expect(service.update('student-uuid', { specialty_ids: [99], ...pw }, 'admin-1'))
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

      const result = await service.findForAuth('immosconi456');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('student-uuid');
      expect(result!.domainRoleNames).toEqual(['Alumno']);
      expect(result!.specialtyNames).toEqual(['Mecánica']);
    });

    it('devuelve los nombres de TODOS los cargos y especialidades, ordenados', async () => {
      const student = makeStudent({
        domainRoles: [makeDomainRole({ id: 2, name: 'Profesor' }), makeDomainRole({ id: 3, name: 'Preceptor' })],
        specialties: [makeSpecialty({ id: 1, name: 'Mecánica' }), makeSpecialty({ id: 2, name: 'Electrónica' })],
      });
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(student) }));

      const result = await service.findForAuth('immosconi456');
      expect(result!.domainRoleNames).toEqual(['Preceptor', 'Profesor']);
      expect(result!.specialtyNames).toEqual(['Electrónica', 'Mecánica']);
    });

    it('debería retornar null si el alumno no existe', async () => {
      const qb = makeQueryBuilder({ getOne: jest.fn().mockResolvedValue(null) });
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findForAuth('noexiste');
      expect(result).toBeNull();
    });
  });

  // ── setPassword ─────────────────────────────────────────────────────────────

  describe('setPassword (N11)', () => {
    // La transacción ejecuta el callback con un manager falso.
    let manager: { findOne: jest.Mock; update: jest.Mock };
    beforeEach(() => {
      manager = { findOne: jest.fn(), update: jest.fn() };
      (mockRepo.manager as unknown as { transaction: jest.Mock }).transaction.mockImplementation(
        async (fn: (m: unknown) => Promise<void>) => fn(manager),
      );
    });

    it('establece la contraseña, activa la cuenta, revoca sesiones e invalida links pendientes en la misma transacción', async () => {
      manager.findOne.mockResolvedValue(makeStudent({ account_status: AccountStatus.PendingRegistration, password: null }));

      await service.setPassword('student-uuid', '$2b$10$hashed');

      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(), { id: 'student-uuid' },
        { password: '$2b$10$hashed', account_status: AccountStatus.Active },
      );
      expect(mockRefreshTokenService.revokeAllForSub).toHaveBeenCalledWith('student-uuid', manager);
      expect(mockPasswordResetTokenService.invalidateAllForStudent).toHaveBeenCalledWith('student-uuid', manager);
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.setPassword('no-existe', '$2b$10$hashed')).rejects.toThrow(NotFoundException);
    });

    it('si la cuenta está suspendida lanza UnauthorizedException y no toca nada', async () => {
      manager.findOne.mockResolvedValue(makeStudent({ account_status: AccountStatus.Suspended }));
      await expect(service.setPassword('student-uuid', '$2b$10$hashed')).rejects.toThrow(UnauthorizedException);
      expect(manager.update).not.toHaveBeenCalled();
      expect(mockRefreshTokenService.revokeAllForSub).not.toHaveBeenCalled();
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
        username: 'immosconi456',
        email: 'alumno@gmail.com',
        first_name: 'Ignacio',
        last_name: 'Mosconi',
        password: '$2b$10$hashed',
        account_status: 'active',
        domainRoleNames: ['Alumno'],
        specialtyNames: ['Mecánica'],
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


  describe('confirmImport (N5/N6/N10)', () => {
    const row = (first: string, last: string, dni: number, email: string) => ({
      first_name: first, last_name: last, dni, email, birth_date: '2001-02-03', domainRoleIds: [1], specialtyIds: [1],
    });

    beforeEach(() => {
      mockRepo.find.mockResolvedValue([]);
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.createQueryBuilder.mockReturnValue(
        makeQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) }),
      );
      mockRepo.create.mockImplementation((e: unknown) => e);
      (mockRepo.manager as unknown as { transaction: jest.Mock }).transaction.mockImplementation(
        async (fn: (m: unknown) => Promise<void>) => fn({ save: jest.fn() }),
      );
    });

    it('N6: dos filas con la misma base de username reciben usernames distintos', async () => {
      const result = await service.confirmImport({
        rows: [row('Pedro', 'Gomez', 40000123, 'pg1@test.local'), row('Paula', 'Gomez', 50000123, 'pg2@test.local')],
      });

      const usernames = mockRepo.create.mock.calls.map(c => (c[0] as { username: string }).username);
      expect(usernames).toEqual(['pgomez123', 'pgomez123_2']);
      expect(result).toEqual({ imported: 2, usernameCollisions: 1 });
    });

    it('N10: emails que solo difieren en mayúsculas dentro del lote se importan una sola vez', async () => {
      const result = await service.confirmImport({
        rows: [row('Ana', 'Perez', 40000001, 'Ana@Test.local'), row('Ani', 'Lopez', 40000002, 'ana@test.local')],
      });

      expect(result.imported).toBe(1);
      expect((mockRepo.create.mock.calls[0][0] as { email: string }).email).toBe('ana@test.local');
    });

    it('N5: no hace consultas por fila (solo por lote)', async () => {
      const rows = Array.from({ length: 50 }, (_, i) => row('Juan', `Zz${String.fromCharCode(97 + i)}`, 60000000 + i, `u${i}@t.local`));
      await service.confirmImport({ rows });

      // findOne se usa solo para chequear username; el resto va por lotes (find / query builder)
      expect(mockRepo.find).toHaveBeenCalledTimes(2); // dnis + recarga con relaciones
      expect(mockRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    describe('reglas de los cargos al confirmar (no se confía en la vista previa)', () => {
      const alumno = makeDomainRole({ id: 1, name: 'Alumno', exclusive: true, singleSpecialty: true });
      const profesor = makeDomainRole({ id: 2, name: 'Profesor' });
      const preceptor = makeDomainRole({ id: 3, name: 'Preceptor' });

      beforeEach(() => {
        mockDomainRoleRepo.find.mockResolvedValue([alumno, profesor, preceptor]);
        mockSpecialtyRepo.find.mockResolvedValue([makeSpecialty({ id: 1 }), makeSpecialty({ id: 2, name: 'Electrónica' })]);
      });

      it('importa filas con varios cargos y especialidades válidos', async () => {
        const result = await service.confirmImport({
          rows: [{ ...row('Ana', 'Perez', 40000001, 'a@t.local'), domainRoleIds: [2, 3], specialtyIds: [1, 2] }],
        });
        expect(result.imported).toBe(1);
        const created = mockRepo.create.mock.calls[0][0] as { domainRoles: { id: number }[]; specialties: { id: number }[] };
        expect(created.domainRoles.map(r => r.id)).toEqual([2, 3]);
        expect(created.specialties.map(sp => sp.id)).toEqual([1, 2]);
      });

      it('si UNA fila viola una regla, no importa NINGUNA y dice qué fila', async () => {
        const err = await service.confirmImport({
          rows: [
            row('Ana', 'Perez', 40000001, 'a@t.local'),
            { ...row('Beto', 'Lopez', 40000002, 'b@t.local'), domainRoleIds: [1, 2] },
          ],
        }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        const message = ((err as BadRequestException).getResponse() as { message: string[] }).message;
        expect(message[1]).toBe('Fila 2: El cargo "Alumno" no se puede combinar con otros cargos.');
        expect(mockRepo.create).not.toHaveBeenCalled();
      });

      it('rechaza ids de cargos o especialidades inexistentes', async () => {
        await expect(service.confirmImport({
          rows: [{ ...row('Ana', 'Perez', 40000001, 'a@t.local'), domainRoleIds: [77] }],
        })).rejects.toThrow(BadRequestException);
        expect(mockRepo.create).not.toHaveBeenCalled();
      });

      it('rechaza dos especialidades para un cargo que exige exactamente una', async () => {
        await expect(service.confirmImport({
          rows: [{ ...row('Ana', 'Perez', 40000001, 'a@t.local'), domainRoleIds: [1], specialtyIds: [1, 2] }],
        })).rejects.toThrow(BadRequestException);
      });
    });
  });

  // ── Excel: vista previa ──────────────────────────────────────────────────────

  describe('parseImportPreview (cargos y especialidades múltiples)', () => {
    const alumno = makeDomainRole({ id: 1, name: 'Alumno', exclusive: true, singleSpecialty: true });
    const profesor = makeDomainRole({ id: 2, name: 'Profesor' });
    const preceptor = makeDomainRole({ id: 3, name: 'Preceptor' });
    const regente = makeDomainRole({ id: 4, name: 'Regente', singleSpecialty: true });
    const mecanica = makeSpecialty({ id: 1, name: 'Mecánica' });
    const electronica = makeSpecialty({ id: 2, name: 'Electrónica' });
    const HEADERS = ['Nombre/s', 'Apellido/s', 'DNI', 'Email', 'Fecha de nacimiento', 'Cargo', 'Especialidad'];

    const xlsx = (rows: unknown[][]): Buffer => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...rows]), 'Usuarios');
      return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array);
    };
    const r = (dni: number, cargo: string, esp: string) =>
      ['Ana', 'Perez', dni, `u${dni}@t.local`, '15/05/2003', cargo, esp];

    beforeEach(() => {
      mockDomainRoleRepo.find.mockResolvedValue([alumno, profesor, preceptor, regente]);
      mockSpecialtyRepo.find.mockResolvedValue([mecanica, electronica]);
      mockRepo.find.mockResolvedValue([]);
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) }));
    });

    it('acepta varios valores separados por ";" o "," (sin distinguir mayúsculas) y devuelve ids ordenados por nombre', async () => {
      const result = await service.parseImportPreview(xlsx([
        r(40000001, 'Profesor; Preceptor', 'mecánica, Electrónica'),
        r(40000002, 'Alumno', 'Mecánica'),
      ]));
      expect(result.valid).toBe(2);
      expect(result.rows[0].data).toEqual({
        first_name: 'Ana', last_name: 'Perez', dni: 40000001, email: 'u40000001@t.local', birth_date: '2003-05-15',
        domainRoleIds: [3, 2], specialtyIds: [2, 1],
      });
      expect(result.rows[1].data).toMatchObject({ domainRoleIds: [1], specialtyIds: [1] });
    });

    it('marca inválida la fila que combina un cargo que no se combina', async () => {
      const result = await service.parseImportPreview(xlsx([r(40000001, 'Alumno; Profesor', 'Mecánica')]));
      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors).toContain('Reglas del cargo: El cargo "Alumno" no se puede combinar con otros cargos.');
      expect(result.rows[0].data).toMatchObject({ domain_role: 'Alumno; Profesor', specialty: 'Mecánica' });
    });

    it('marca inválida la fila con dos especialidades si ALGUNO de sus cargos exige una sola', async () => {
      const result = await service.parseImportPreview(xlsx([r(40000001, 'Profesor; Regente', 'Mecánica; Electrónica')]));
      expect(result.rows[0].errors).toContain('Reglas del cargo: El cargo "Regente" exige exactamente una especialidad (se indicaron 2).');
    });

    it('informa cargos/especialidades inexistentes y repetidos', async () => {
      const result = await service.parseImportPreview(xlsx([r(40000001, 'Profesor; Inventado; profesor', 'Mecánica; Mecánica')]));
      expect(result.rows[0].errors).toEqual(expect.arrayContaining([
        'Cargo: "Inventado" no existe en el sistema.',
        'Cargo: "profesor" está repetido.',
        'Especialidad: "Mecánica" está repetida.',
      ]));
    });

    it('exige al menos un cargo y una especialidad (celdas con solo separadores)', async () => {
      const result = await service.parseImportPreview(xlsx([r(40000001, ' ; ', ',')]));
      expect(result.rows[0].errors).toEqual(expect.arrayContaining([
        'Cargo: indicá al menos un cargo.',
        'Especialidad: indicá al menos una especialidad.',
      ]));
    });

    it('limita la cantidad de cargos por celda', async () => {
      const many = Array.from({ length: 11 }, () => 'Profesor').join(';');
      const result = await service.parseImportPreview(xlsx([r(40000001, many, 'Mecánica')]));
      expect(result.rows[0].errors).toContain('Cargo: máximo 10 cargos por usuario.');
    });
  });

  // ── Excel: archivo de ejemplo ────────────────────────────────────────────────

  describe('generateExampleXlsx', () => {
    const readSheet = (buf: Buffer) => {
      const ws = XLSX.read(buf, { type: 'buffer' }).Sheets['Usuarios'];
      return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    };

    it('incluye un ejemplo simple y uno múltiple que respetan las reglas reales, y la tabla de reglas', async () => {
      mockDomainRoleRepo.find.mockResolvedValue([
        makeDomainRole({ id: 1, name: 'Alumno', exclusive: true, singleSpecialty: true }),
        makeDomainRole({ id: 2, name: 'Preceptor' }),
        makeDomainRole({ id: 3, name: 'Profesor' }),
      ]);
      mockSpecialtyRepo.find.mockResolvedValue([makeSpecialty({ id: 2, name: 'Electrónica' }), makeSpecialty({ id: 1, name: 'Mecánica' })]);

      const rows = readSheet(await service.generateExampleXlsx());

      expect(rows[0].slice(0, 7)).toEqual(['Nombre/s', 'Apellido/s', 'DNI', 'Email', 'Fecha de nacimiento', 'Cargo', 'Especialidad']);
      expect(rows[1].slice(5, 7)).toEqual(['Alumno', 'Electrónica']);
      expect(rows[2].slice(5, 7)).toEqual(['Preceptor; Profesor', 'Electrónica; Mecánica']);
      // Tabla de reglas: I-K
      expect(rows[0].slice(8, 11)).toEqual(['Cargos válidos', '¿Se combina con otros cargos?', 'Especialidades permitidas']);
      expect(rows[1].slice(8, 11)).toEqual(['Alumno', 'No: debe ser el único cargo', 'Exactamente una']);
      expect(rows[2].slice(8, 11)).toEqual(['Preceptor', 'Sí', 'Una o más']);
      expect(rows[0][12]).toBe('Especialidades válidas');
      expect(rows.flat()).toContain('Cómo cargar varios valores');
    });

    it('el archivo de ejemplo pasa su propia vista previa sin errores', async () => {
      const roles = [
        makeDomainRole({ id: 1, name: 'Alumno', exclusive: true, singleSpecialty: true }),
        makeDomainRole({ id: 2, name: 'Preceptor' }),
        makeDomainRole({ id: 3, name: 'Profesor' }),
      ];
      const specs = [makeSpecialty({ id: 2, name: 'Electrónica' }), makeSpecialty({ id: 1, name: 'Mecánica' })];
      mockDomainRoleRepo.find.mockResolvedValue(roles);
      mockSpecialtyRepo.find.mockResolvedValue(specs);
      mockRepo.find.mockResolvedValue([]);
      mockRepo.createQueryBuilder.mockReturnValue(makeQueryBuilder({ getRawMany: jest.fn().mockResolvedValue([]) }));

      const preview = await service.parseImportPreview(await service.generateExampleXlsx());
      expect(preview.invalid).toBe(0);
      expect(preview.valid).toBe(3);
    });
  });
});
