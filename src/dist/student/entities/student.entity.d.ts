import { DomainRoleEntity } from '../../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../../specialty/entities/specialty.entity.js';
export declare enum AccountStatus {
    Active = "active",
    Suspended = "suspended",
    PendingRegistration = "pending_registration"
}
export declare class StudentEntity {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    email: string;
    password: string | null;
    dni: number;
    birth_date: Date;
    domainRole: DomainRoleEntity;
    domainRoleId: number;
    specialty: SpecialtyEntity;
    specialtyId: number;
    account_status: AccountStatus;
    createdAt: Date;
    updatedAt: Date;
}
