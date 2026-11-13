import { Repository } from 'typeorm';
import { IAdminService } from './admin.service.interface.js';
import type { IRefreshTokenService } from '../../refresh-token/services/refresh-token.service.interface.js';
import { AdminEntity } from '../entities/admin.entity.js';
import { CreateAdminDto } from '../dtos/create-admin.dto.js';
import { DeleteSelfAdminDto } from '../dtos/delete-self-admin.dto.js';
import { UpdateAdminDto } from '../dtos/update-admin.dto.js';
import { AdminResponseDto } from '../dtos/admin-response.dto.js';
export declare class AdminService implements IAdminService {
    private readonly adminRepository;
    private readonly refreshTokenService;
    constructor(adminRepository: Repository<AdminEntity>, refreshTokenService: IRefreshTokenService);
    private toDto;
    findAll(): Promise<AdminResponseDto[]>;
    findOne(id: string): Promise<AdminResponseDto>;
    create(dto: CreateAdminDto): Promise<AdminResponseDto>;
    updateSelf(id: string, dto: UpdateAdminDto): Promise<AdminResponseDto>;
    removeSelf(id: string, dto: DeleteSelfAdminDto): Promise<void>;
}
