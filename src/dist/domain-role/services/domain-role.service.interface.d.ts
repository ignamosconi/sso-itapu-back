import { CreateDomainRoleDto } from '../dtos/create-domain-role.dto.js';
import { DomainRoleResponseDto } from '../dtos/domain-role-response.dto.js';
export interface IDomainRoleService {
    findAll(): Promise<DomainRoleResponseDto[]>;
    findOne(id: number): Promise<DomainRoleResponseDto>;
    create(dto: CreateDomainRoleDto): Promise<DomainRoleResponseDto>;
    remove(id: number): Promise<void>;
}
