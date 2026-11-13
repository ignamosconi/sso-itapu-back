import { CreateStudentDto } from '../dtos/create-student.dto.js';
import { UpdateStudentDto } from '../dtos/update-student.dto.js';
import { DeleteStudentDto } from '../dtos/delete-student.dto.js';
import { StudentResponseDto } from '../dtos/student-response.dto.js';
import { StudentFiltersDto } from '../dtos/student-filters.dto.js';
import { ImportPreviewResultDto } from '../dtos/import-preview-result.dto.js';
import { ImportConfirmDto, ImportConfirmResultDto } from '../dtos/import-confirm.dto.js';
import { StudentCredentialsDto } from '../dtos/student-credentials.dto.js';
export interface IStudentService {
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
    parseImportPreview(csvBuffer: Buffer): Promise<ImportPreviewResultDto>;
    confirmImport(dto: ImportConfirmDto): Promise<ImportConfirmResultDto>;
    generateExampleCsv(): string;
    sendPasswordResetEmail(student: StudentCredentialsDto): Promise<void>;
    findForAuth(username: string): Promise<StudentCredentialsDto | null>;
    setPassword(studentId: string, hashedPassword: string): Promise<void>;
}
