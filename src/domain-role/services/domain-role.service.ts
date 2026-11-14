import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IDomainRoleService } from './domain-role.service.interface.js';
import { DomainRoleEntity } from '../entities/domain-role.entity.js';
import { CreateDomainRoleDto } from '../dtos/create-domain-role.dto.js';
import { DomainRoleResponseDto } from '../dtos/domain-role-response.dto.js';

@Injectable()
export class DomainRoleService implements IDomainRoleService {
  constructor(
    @InjectRepository(DomainRoleEntity)
    private readonly repo: Repository<DomainRoleEntity>,
  ) {}

  private toDto(e: DomainRoleEntity): DomainRoleResponseDto {
    return { id: e.id, name: e.name, createdAt: e.createdAt, updatedAt: e.updatedAt };
  }

  async findAll(): Promise<DomainRoleResponseDto[]> {
    return (await this.repo.find({ order: { name: 'ASC' } })).map(e => this.toDto(e));
  }

  async findOne(id: number): Promise<DomainRoleResponseDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Rol con id ${id} no encontrado.`);
    return this.toDto(entity);
  }

  async create(dto: CreateDomainRoleDto): Promise<DomainRoleResponseDto> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException(`El rol "${dto.name}" ya existe.`);
    return this.toDto(await this.repo.save(this.repo.create({ name: dto.name })));
  }

  async remove(id: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Rol con id ${id} no encontrado.`);
    const [result] = await this.repo.manager.query<[{ count: string }]>(
      `SELECT COUNT(*) FROM students WHERE domain_role_id = $1`,
      [id],
    );
    if (parseInt(result.count, 10) > 0) {
      throw new BadRequestException(
        `No se puede eliminar el rol "${entity.name}" porque hay ${result.count} usuario(s) asignado(s) a él.`,
      );
    }
    await this.repo.remove(entity);
  }
}