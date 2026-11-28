import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DomainRoleService } from './domain-role.service.js';
import { DomainRoleEntity } from '../entities/domain-role.entity.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDomainRole(overrides: Partial<DomainRoleEntity> = {}): DomainRoleEntity {
  return {
    id: 1,
    name: 'Alumno',
    exclusive: false,
    singleSpecialty: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('DomainRoleService', () => {
  let service: DomainRoleService;
  let mockRepo: jest.Mocked<Record<string, jest.Mock>>;

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      manager: {
        query: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainRoleService,
        { provide: getRepositoryToken(DomainRoleEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<DomainRoleService>(DomainRoleService);
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debería retornar todos los cargos mapeados a DTO', async () => {
      mockRepo.find.mockResolvedValue([
        makeDomainRole(),
        makeDomainRole({ id: 2, name: 'Docente' }),
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alumno');
      expect(result[1].name).toBe('Docente');
    });

    it('debería retornar un array vacío si no hay cargos', async () => {
      mockRepo.find.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toHaveLength(0);
    });

    it('debería ordenar por nombre (delegado a la query)', async () => {
      mockRepo.find.mockResolvedValue([]);
      await service.findAll();
      expect(mockRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debería retornar el cargo si existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Alumno');
    });

    it('debería lanzar NotFoundException si el cargo no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('debería crear un cargo nuevo y retornarlo como DTO', async () => {
      mockRepo.findOne.mockResolvedValue(null); // no existe aún
      mockRepo.create.mockReturnValue(makeDomainRole());
      mockRepo.save.mockResolvedValue(makeDomainRole());

      const result = await service.create({ name: 'Alumno' });

      expect(result.name).toBe('Alumno');
      expect(result.id).toBe(1);
    });

    it('sin reglas indicadas, el cargo se crea combinable y con una o más especialidades', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((e: object) => ({ ...makeDomainRole(), ...e }));
      mockRepo.save.mockImplementation((e: unknown) => Promise.resolve(e));

      const result = await service.create({ name: 'Profesor' });

      expect(mockRepo.create).toHaveBeenCalledWith({ name: 'Profesor', exclusive: false, singleSpecialty: false });
      expect(result).toMatchObject({ exclusive: false, singleSpecialty: false });
    });

    it('guarda las dos reglas indicadas al crear y las devuelve', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockImplementation((e: object) => ({ ...makeDomainRole(), ...e }));
      mockRepo.save.mockImplementation((e: unknown) => Promise.resolve(e));

      const result = await service.create({ name: 'Alumno', exclusive: true, single_specialty: true });

      expect(mockRepo.create).toHaveBeenCalledWith({ name: 'Alumno', exclusive: true, singleSpecialty: true });
      expect(result).toMatchObject({ name: 'Alumno', exclusive: true, singleSpecialty: true });
    });

    it('debería lanzar ConflictException si el nombre ya existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole()); // ya existe

      await expect(service.create({ name: 'Alumno' })).rejects.toThrow(ConflictException);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('debería eliminar el cargo si no hay usuarios asignados', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());
      mockRepo.manager.query.mockResolvedValue([{ count: '0' }]);
      mockRepo.remove.mockResolvedValue({});

      await service.remove(1);

      expect(mockRepo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });

    it('debería lanzar NotFoundException si el cargo no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar BadRequestException si hay usuarios asignados al cargo', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());
      mockRepo.manager.query.mockResolvedValue([{ count: '5' }]);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });

    it('cuenta los usuarios en la tabla de asignaciones (un usuario puede tener varios cargos)', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());
      mockRepo.manager.query.mockResolvedValue([{ count: '0' }]);
      await service.remove(1);
      expect(mockRepo.manager.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) FROM student_domain_roles WHERE domain_role_id = $1', [1],
      );
    });

    it('el mensaje de error debería incluir la cantidad de usuarios afectados', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());
      mockRepo.manager.query.mockResolvedValue([{ count: '3' }]);

      await expect(service.remove(1)).rejects.toThrow('3');
    });
  });
});
