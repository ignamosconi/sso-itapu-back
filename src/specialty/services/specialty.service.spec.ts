import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { SpecialtyService } from './specialty.service.js';
import { SpecialtyEntity } from '../entities/specialty.entity.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSpecialty(overrides: Partial<SpecialtyEntity> = {}): SpecialtyEntity {
  return {
    id: 1,
    name: 'Mecánica',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SpecialtyService', () => {
  let service: SpecialtyService;
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
        SpecialtyService,
        { provide: getRepositoryToken(SpecialtyEntity), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<SpecialtyService>(SpecialtyService);
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debería retornar todas las especialidades mapeadas a DTO', async () => {
      mockRepo.find.mockResolvedValue([
        makeSpecialty(),
        makeSpecialty({ id: 2, name: 'Química' }),
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Mecánica');
      expect(result[1].name).toBe('Química');
    });

    it('debería retornar un array vacío si no hay especialidades', async () => {
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
    it('debería retornar la especialidad si existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeSpecialty());

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
      expect(result.name).toBe('Mecánica');
    });

    it('debería lanzar NotFoundException si la especialidad no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('debería crear una especialidad nueva y retornarla como DTO', async () => {
      mockRepo.findOne.mockResolvedValue(null); // no existe aún
      mockRepo.create.mockReturnValue(makeSpecialty());
      mockRepo.save.mockResolvedValue(makeSpecialty());

      const result = await service.create({ name: 'Mecánica' });

      expect(result.name).toBe('Mecánica');
      expect(result.id).toBe(1);
    });

    it('debería lanzar ConflictException si el nombre ya existe', async () => {
      mockRepo.findOne.mockResolvedValue(makeSpecialty()); // ya existe

      await expect(service.create({ name: 'Mecánica' })).rejects.toThrow(ConflictException);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  // ── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('debería eliminar la especialidad si no hay usuarios asignados', async () => {
      mockRepo.findOne.mockResolvedValue(makeSpecialty());
      mockRepo.manager.query.mockResolvedValue([{ count: '0' }]);
      mockRepo.remove.mockResolvedValue({});

      await service.remove(1);

      expect(mockRepo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });

    it('debería lanzar NotFoundException si la especialidad no existe', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar BadRequestException si hay usuarios asignados a la especialidad', async () => {
      mockRepo.findOne.mockResolvedValue(makeSpecialty());
      mockRepo.manager.query.mockResolvedValue([{ count: '8' }]);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });

    it('el mensaje de error debería incluir la cantidad de usuarios afectados', async () => {
      mockRepo.findOne.mockResolvedValue(makeSpecialty());
      mockRepo.manager.query.mockResolvedValue([{ count: '8' }]);

      await expect(service.remove(1)).rejects.toThrow('8');
    });
  });
});
