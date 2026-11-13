import { CreateAdminDto } from '../dtos/create-admin.dto.js';
import { UpdateAdminDto } from '../dtos/update-admin.dto.js';
import { AdminResponseDto } from '../dtos/admin-response.dto.js';
import { AdminJwtPayloadDto } from '../../admin-auth/dtos/admin-jwt-payload.dto.js';
import { DeleteSelfAdminDto } from '../dtos/delete-self-admin.dto.js';
interface RequestWithAdmin {
    admin: AdminJwtPayloadDto;
}
export interface IAdminController {
    findAll(): Promise<AdminResponseDto[]>;
    findOne(id: string): Promise<AdminResponseDto>;
    create(dto: CreateAdminDto): Promise<AdminResponseDto>;
    updateSelf(dto: UpdateAdminDto, req: RequestWithAdmin): Promise<AdminResponseDto>;
    removeSelf(dto: DeleteSelfAdminDto, req: RequestWithAdmin): Promise<void>;
}
export {};
