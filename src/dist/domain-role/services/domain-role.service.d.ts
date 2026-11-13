import { Repository } from 'typeorm';
import type { IDomainRoleService } from './domain-role.service.interface.js';
import { DomainRoleEntity } from '../entities/domain-role.entity.js';
import { CreateDomainRoleDto } from '../dtos/create-domain-role.dto.js';
import { DomainRoleResponseDto } from '../dtos/domain-role-response.dto.js';
export declare class DomainRoleService implements IDomainRoleService {
    private readonly repo;
    constructor(repo: Repository<DomainRoleEntity>);
    private toDto;
    findAll(): Promise<DomainRoleResponseDto[]>;
    findOne(id: number): Promise<DomainRoleResponseDto>;
    create(dto: CreateDomainRoleDto): Promise<DomainRoleResponseDto>;
    remove(id: number): Promise<void>;
}
