import { CreateSpecialtyDto } from '../dtos/create-specialty.dto.js';
import { SpecialtyResponseDto } from '../dtos/specialty-response.dto.js';
export interface ISpecialtyService {
    findAll(): Promise<SpecialtyResponseDto[]>;
    findOne(id: number): Promise<SpecialtyResponseDto>;
    create(dto: CreateSpecialtyDto): Promise<SpecialtyResponseDto>;
    remove(id: number): Promise<void>;
}
