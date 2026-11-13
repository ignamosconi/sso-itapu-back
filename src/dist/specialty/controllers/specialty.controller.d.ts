import type { ISpecialtyController } from './specialty.controller.interface.js';
import type { ISpecialtyService } from '../services/specialty.service.interface.js';
import { CreateSpecialtyDto } from '../dtos/create-specialty.dto.js';
import { SpecialtyResponseDto } from '../dtos/specialty-response.dto.js';
export declare class SpecialtyController implements ISpecialtyController {
    private readonly service;
    constructor(service: ISpecialtyService);
    findAll(): Promise<SpecialtyResponseDto[]>;
    findOne(id: number): Promise<SpecialtyResponseDto>;
    create(dto: CreateSpecialtyDto): Promise<SpecialtyResponseDto>;
    remove(id: number): Promise<void>;
}
