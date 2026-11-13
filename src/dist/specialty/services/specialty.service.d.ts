import { Repository } from 'typeorm';
import type { ISpecialtyService } from './specialty.service.interface.js';
import { SpecialtyEntity } from '../entities/specialty.entity.js';
import { CreateSpecialtyDto } from '../dtos/create-specialty.dto.js';
import { SpecialtyResponseDto } from '../dtos/specialty-response.dto.js';
export declare class SpecialtyService implements ISpecialtyService {
    private readonly repo;
    constructor(repo: Repository<SpecialtyEntity>);
    private toDto;
    findAll(): Promise<SpecialtyResponseDto[]>;
    findOne(id: number): Promise<SpecialtyResponseDto>;
    create(dto: CreateSpecialtyDto): Promise<SpecialtyResponseDto>;
    remove(id: number): Promise<void>;
}
