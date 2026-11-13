import type { IDomainRoleController } from './domain-role.controller.interface.js';
import type { IDomainRoleService } from '../services/domain-role.service.interface.js';
import { CreateDomainRoleDto } from '../dtos/create-domain-role.dto.js';
import { DomainRoleResponseDto } from '../dtos/domain-role-response.dto.js';
export declare class DomainRoleController implements IDomainRoleController {
    private readonly service;
    constructor(service: IDomainRoleService);
    findAll(): Promise<DomainRoleResponseDto[]>;
    findOne(id: number): Promise<DomainRoleResponseDto>;
    create(dto: CreateDomainRoleDto): Promise<DomainRoleResponseDto>;
    remove(id: number): Promise<void>;
}
