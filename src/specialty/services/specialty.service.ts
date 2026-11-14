import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ISpecialtyService } from './specialty.service.interface.js';
import { SpecialtyEntity } from '../entities/specialty.entity.js';
import { CreateSpecialtyDto } from '../dtos/create-specialty.dto.js';
import { SpecialtyResponseDto } from '../dtos/specialty-response.dto.js';

@Injectable()
export class SpecialtyService implements ISpecialtyService {
  constructor(
    @InjectRepository(SpecialtyEntity)
    private readonly repo: Repository<SpecialtyEntity>,
  ) {}

  private toDto(e: SpecialtyEntity): SpecialtyResponseDto {
    return { id: e.id, name: e.name, createdAt: e.createdAt, updatedAt: e.updatedAt };
  }

  async findAll(): Promise<SpecialtyResponseDto[]> {
    return (await this.repo.find({ order: { name: 'ASC' } })).map(e => this.toDto(e));
  }

  async findOne(id: number): Promise<SpecialtyResponseDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Especialidad con id ${id} no encontrada.`);
    return this.toDto(entity);
  }

  async create(dto: CreateSpecialtyDto): Promise<SpecialtyResponseDto> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException(`La especialidad "${dto.name}" ya existe.`);
    return this.toDto(await this.repo.save(this.repo.create({ name: dto.name })));
  }

  async remove(id: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Especialidad con id ${id} no encontrada.`);
    const [result] = await this.repo.manager.query<[{ count: string }]>(
      `SELECT COUNT(*) FROM students WHERE specialty_id = $1`,
      [id],
    );
    if (parseInt(result.count, 10) > 0) {
      throw new BadRequestException(
        `No se puede eliminar la especialidad "${entity.name}" porque hay ${result.count} usuario(s) asignado(s) a ella.`,
      );
    }
    await this.repo.remove(entity);
  }
}