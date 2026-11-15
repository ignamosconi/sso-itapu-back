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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DomainRoleEntity;
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
    it('debería retornar todos los roles mapeados a DTO', async () => {
      mockRepo.find.mockResolvedValue([
        makeDomainRole(),
        makeDomainRole({ id: 2, name: 'Docente' }),
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alumno');
      expect(result[1].name).toBe('Docente');
    });

    it('debería retornar un array vacío si no hay roles', async () => {
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
    it('debería retornar el rol si existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Alumno');
    });

    it('debería lanzar NotFoundException si el rol no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('debería crear un rol nuevo y retornarlo como DTO', async () => {
      mockRepo.findOne.mockResolvedValue(null); // no existe aún
      mockRepo.create.mockReturnValue(makeDomainRole());
      mockRepo.save.mockResolvedValue(makeDomainRole());

      const result = await service.create({ name: 'Alumno' });

      expect(result.name).toBe('Alumno');
      expect(result.id).toBe(1);
    });

    it('debería lanzar ConflictException si el nombre ya existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole()); // ya existe

      await expect(service.create({ name: 'Alumno' })).rejects.toThrow(ConflictException);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('debería eliminar el rol si no hay usuarios asignados', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());
      mockRepo.manager.query.mockResolvedValue([{ count: '0' }]);
      mockRepo.remove.mockResolvedValue({});

      await service.remove(1);

      expect(mockRepo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });

    it('debería lanzar NotFoundException si el rol no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar BadRequestException si hay usuarios asignados al rol', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());
      mockRepo.manager.query.mockResolvedValue([{ count: '5' }]);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });

    it('el mensaje de error debería incluir la cantidad de usuarios afectados', async () => {
      mockRepo.findOne.mockResolvedValue(makeDomainRole());
      mockRepo.manager.query.mockResolvedValue([{ count: '3' }]);

      await expect(service.remove(1)).rejects.toThrow('3');
    });
  });
});
