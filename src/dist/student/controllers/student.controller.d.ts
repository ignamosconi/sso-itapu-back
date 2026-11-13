import type { Response } from 'express';
import type { IStudentController } from './student.controller.interface.js';
import type { IStudentService } from '../services/student.service.interface.js';
import { CreateStudentDto } from '../dtos/create-student.dto.js';
import { UpdateStudentDto } from '../dtos/update-student.dto.js';
import { DeleteStudentDto } from '../dtos/delete-student.dto.js';
import { StudentResponseDto } from '../dtos/student-response.dto.js';
import { StudentFiltersDto } from '../dtos/student-filters.dto.js';
import { ImportPreviewResultDto } from '../dtos/import-preview-result.dto.js';
import { ImportConfirmDto, ImportConfirmResultDto } from '../dtos/import-confirm.dto.js';
export declare class StudentController implements IStudentController {
    private readonly service;
    constructor(service: IStudentService);
    findAll(filters: StudentFiltersDto): Promise<{
        data: StudentResponseDto[];
        total: number;
    }>;
    findOne(id: string): Promise<StudentResponseDto>;
    create(dto: CreateStudentDto): Promise<StudentResponseDto>;
    update(id: string, dto: UpdateStudentDto): Promise<StudentResponseDto>;
    remove(id: string, dto: DeleteStudentDto): Promise<void>;
    suspend(id: string): Promise<StudentResponseDto>;
    activate(id: string): Promise<StudentResponseDto>;
    resendWelcome(id: string): Promise<void>;
    downloadExample(res: Response): void;
    importPreview(file: Express.Multer.File): Promise<ImportPreviewResultDto>;
    importConfirm(dto: ImportConfirmDto): Promise<ImportConfirmResultDto>;
}
