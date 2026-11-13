import { CreateStudentDto } from '../dtos/create-student.dto.js';
import { UpdateStudentDto } from '../dtos/update-student.dto.js';
import { DeleteStudentDto } from '../dtos/delete-student.dto.js';
import { StudentResponseDto } from '../dtos/student-response.dto.js';
import { StudentFiltersDto } from '../dtos/student-filters.dto.js';
import { ImportPreviewResultDto } from '../dtos/import-preview-result.dto.js';
import { ImportConfirmDto, ImportConfirmResultDto } from '../dtos/import-confirm.dto.js';
export interface IStudentController {
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
    importPreview(file: Express.Multer.File): Promise<ImportPreviewResultDto>;
    importConfirm(dto: ImportConfirmDto): Promise<ImportConfirmResultDto>;
    downloadExample(res: Response): void;
    resendWelcome(id: string): Promise<void>;
}
