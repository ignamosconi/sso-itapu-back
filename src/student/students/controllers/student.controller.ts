import { Throttle } from '@nestjs/throttler';
import { AdminThrottle } from '../../../common/decorators/admin-throttle.decorator.js';
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Inject,
  UseGuards, ParseUUIDPipe, Query, UseInterceptors, UploadedFile,
  BadRequestException, Res, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth, ApiOperation, ApiResponse, ApiTags,
  ApiConsumes, ApiBody,
} from '@nestjs/swagger';
import type { IStudentController } from './student.controller.interface.js';
import type { IStudentService } from '../services/student.service.interface.js';
import { CreateStudentDto } from '../dtos/create-student.dto.js';
import { UpdateStudentDto } from '../dtos/update-student.dto.js';
import { DeleteStudentDto } from '../dtos/delete-student.dto.js';
import { StudentResponseDto } from '../dtos/student-response.dto.js';
import { PasswordLockStatusDto } from '../../password-attempts/dtos/password-lock-status.dto.js';
import { StudentFiltersDto } from '../dtos/student-filters.dto.js';
import { ImportPreviewResultDto } from '../dtos/import-preview-result.dto.js';
import { ImportConfirmDto, ImportConfirmResultDto } from '../dtos/import-confirm.dto.js';
import { AdminJwtGuard } from '../../../common/guards/admin-jwt.guard.js';
import 'multer';   //Si no está esta línea, se rompe el multer abajo.

// Lee un entero positivo del entorno cada vez que se evalúa el límite. Si la variable no
// está o es inválida se usa el valor por defecto (que es el más estricto, no el más laxo).
const envInt = (name: string, fallback: number) => (): number => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

@ApiTags('Admin — Padrón de usuarios')
@ApiBearerAuth('admin-jwt')
@UseGuards(AdminJwtGuard)
@AdminThrottle()
@Controller('admin/students')
export class StudentController implements IStudentController {
  constructor(
    @Inject('IStudentService')
    private readonly service: IStudentService,
  ) {}

  @ApiOperation({ summary: 'Listar usuarios con filtros y paginación' })
  @ApiResponse({ status: 200 })
  @Get()
  findAll(@Query() filters: StudentFiltersDto): Promise<{ data: StudentResponseDto[]; total: number }> {
    return this.service.findAll(filters);
  }

  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<StudentResponseDto> {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Registrar un usuario individualmente' })
  @ApiResponse({ status: 201, type: StudentResponseDto })
  @Post()
  create(@Body() dto: CreateStudentDto): Promise<StudentResponseDto> {
    return this.service.create(dto);
  }

  @ApiOperation({
    summary: 'Actualizar datos de un usuario',
    description: 'No permite modificar email ni contraseña.',
  })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    return this.service.update(id, dto);
  }

  @ApiOperation({
    summary: 'Dar de baja a un usuario',
    description:
      'Si el usuario tiene contraseña, se requiere ingresarla para confirmar la baja. ' +
      'El alumno debe estar presente al momento de la baja. ' +
      'Protegido con dos límites configurables por entorno: requests por minuto por IP ' +
      '(STUDENT_DELETE_THROTTLE_*) e intentos de contraseña por alumno (STUDENT_PASSWORD_*).',
  })
  @ApiResponse({ status: 200, description: 'Usuario dado de baja' })
  @ApiResponse({
    status: 403,
    description: 'Contraseña del alumno incorrecta (body: attemptsRemaining y retryAfterSeconds)',
  })
  @ApiResponse({
    status: 429,
    description:
      'Demasiados requests (header Retry-After) o demasiados intentos de contraseña ' +
      'para este alumno (body: code PASSWORD_ATTEMPTS_LOCKED y retryAfterSeconds)',
  })
  @Throttle({
    default: {
      ttl: envInt('STUDENT_DELETE_THROTTLE_TTL_MS', 60_000),
      limit: envInt('STUDENT_DELETE_THROTTLE_LIMIT', 10),
    },
  })
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteStudentDto,
  ): Promise<void> {
    return this.service.remove(id, dto);
  }

  @ApiOperation({
    summary: 'Ver si la baja de un alumno está bloqueada por intentos de contraseña',
    description:
      'No consume intentos. Lo usa el panel al abrir el modal de baja para mostrar la espera ' +
      'de inmediato en lugar de hacer que el admin gaste un intento para descubrirla.',
  })
  @ApiResponse({ status: 200, type: PasswordLockStatusDto })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  @Get(':id/password-lock')
  getPasswordLock(@Param('id', ParseUUIDPipe) id: string): Promise<PasswordLockStatusDto> {
    return this.service.getPasswordLockStatus(id);
  }

  @ApiOperation({ summary: 'Suspender cuenta de usuario' })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  @Patch(':id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string): Promise<StudentResponseDto> {
    return this.service.suspend(id);
  }

  @ApiOperation({ summary: 'Reactivar cuenta de usuario' })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  @Patch(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<StudentResponseDto> {
    return this.service.activate(id);
  }

  @ApiOperation({
    summary: 'Reenviar email de bienvenida',
    description:
      'Solo disponible para cuentas en estado pending_registration. ' +
      'Genera un nuevo token de setup y reenvía el email con el link de configuración de contraseña.',
  })
  @ApiResponse({ status: 204, description: 'Email reenviado' })
  @ApiResponse({ status: 400, description: 'La cuenta no está en estado pending_registration' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  @HttpCode(204)
  @Post(':id/resend-welcome')
  resendWelcome(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.resendWelcome(id);
  }

  @ApiOperation({ summary: 'Descargar CSV de ejemplo para carga masiva' })
  @Get('import/example')
  async downloadExample(@Res() res: Response): Promise<void> {
    const buffer = await this.service.generateExampleXlsx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ejemplo-carga-masiva.xlsx"');
    res.send(buffer);
  }

  @ApiOperation({ summary: 'Previsualizar importación CSV antes de confirmar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 200, type: ImportPreviewResultDto })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @Post('import/preview')
  importPreview(@UploadedFile() file: Express.Multer.File): Promise<ImportPreviewResultDto> {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    return this.service.parseImportPreview(file.buffer);
  }

  @ApiOperation({ summary: 'Confirmar importación de filas válidas previamente parseadas' })
  @ApiResponse({ status: 201, type: ImportConfirmResultDto })
  @Post('import/confirm')
  importConfirm(@Body() dto: ImportConfirmDto): Promise<ImportConfirmResultDto> {
    return this.service.confirmImport(dto);
  }
}