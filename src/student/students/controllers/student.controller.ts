import { Throttle } from '@nestjs/throttler';
import { AdminThrottle } from '../../../common/decorators/admin-throttle.decorator.js';
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Inject,
  UseGuards, ParseUUIDPipe, Query, UseInterceptors, UploadedFile,
  BadRequestException, Res, HttpCode, Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth, ApiOperation, ApiResponse, ApiTags,
  ApiConsumes, ApiBody,
} from '@nestjs/swagger';
import type { IStudentController, RequestWithAdmin } from './student.controller.interface.js';
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

  @ApiOperation({
    summary: 'Registrar un usuario individualmente',
    description:
      'Un usuario tiene uno o más cargos (`domain_role_ids`) y una o más especialidades (`specialty_ids`). ' +
      'Reglas de cada cargo: si alguno es "exclusive", debe ser el único cargo; si alguno es "single_specialty", ' +
      'debe haber exactamente una especialidad. El usuario recibe el mail de bienvenida para configurar su contraseña.',
  })
  @ApiResponse({ status: 201, type: StudentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos o combinación de cargos/especialidades que viola las reglas' })
  @ApiResponse({ status: 404, description: 'Cargo o especialidad no encontrado' })
  @ApiResponse({ status: 409, description: 'DNI o email ya registrado' })
  @Post()
  create(@Body() dto: CreateStudentDto): Promise<StudentResponseDto> {
    return this.service.create(dto);
  }

  @ApiOperation({
    summary: 'Editar datos de un usuario',
    description:
      'Permite cambiar nombre, apellido, DNI, fecha de nacimiento, cargos y especialidades. No permite modificar ' +
      'email (tiene su propio flujo con confirmación) ni contraseña, y el nombre de usuario no cambia.\n\n' +
      '**Confirmación obligatoria:** `admin_password` es la contraseña del administrador que hace el cambio. Tiene ' +
      'límite de intentos por admin (`ADMIN_CONFIRM_PASSWORD_MAX_ATTEMPTS` / `ADMIN_CONFIRM_PASSWORD_LOCK_TTL_MS`).\n\n' +
      '**Cargos y especialidades:** `domain_role_ids` y `specialty_ids` REEMPLAZAN las listas completas. Se valida la ' +
      'combinación final con las reglas de cada cargo: si alguno es "exclusive" debe ser el único cargo; si alguno es ' +
      '"single_specialty" debe haber exactamente una especialidad. Siempre al menos un cargo y una especialidad.\n\n' +
      '**Aviso:** el usuario recibe un mail con el antes y el después de cada dato que cambió.\n\n' +
      '**Cuándo aplica:** las apps ven los cambios en la próxima renovación del token del usuario ' +
      '(como máximo JWT_ACCESS_EXPIRES_IN, 15 minutos por defecto) o en su próximo inicio de sesión.',
  })
  @ApiResponse({ status: 200, type: StudentResponseDto })
  @ApiResponse({ status: 400, description: 'Datos inválidos, sin cambios, o combinación de cargos/especialidades que viola las reglas (message: lista de reglas violadas)' })
  @ApiResponse({ status: 403, description: 'Contraseña del administrador incorrecta (body: attemptsRemaining y retryAfterSeconds)' })
  @ApiResponse({ status: 404, description: 'Usuario, cargo o especialidad no encontrado' })
  @ApiResponse({ status: 409, description: 'El DNI ya está registrado' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos de contraseña de administrador (body: code ADMIN_PASSWORD_ATTEMPTS_LOCKED y retryAfterSeconds)' })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
    @Request() req: RequestWithAdmin,
  ): Promise<StudentResponseDto> {
    return this.service.update(id, dto, req.admin.sub);
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

  @ApiOperation({
    summary: 'Descargar Excel de ejemplo para carga masiva',
    description:
      'Incluye filas de ejemplo (con un cargo y con varios), los cargos válidos con sus reglas, las especialidades ' +
      'válidas y cómo cargar varios valores en una celda (separados por punto y coma).',
  })
  @Get('import/example')
  async downloadExample(@Res() res: Response): Promise<void> {
    const buffer = await this.service.generateExampleXlsx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ejemplo-carga-masiva.xlsx"');
    res.send(buffer);
  }

  @ApiOperation({
    summary: 'Previsualizar importación desde Excel antes de confirmar',
    description:
      'Las columnas Cargo y Especialidad aceptan varios valores separados por ";" (o ","). Cada fila se valida: ' +
      'formato, duplicados, existencia de cargos y especialidades, y las reglas de cada cargo. Las filas válidas ' +
      'devuelven en `data` exactamente lo que espera /import/confirm (con `domainRoleIds` y `specialtyIds`).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 200, type: ImportPreviewResultDto })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @Post('import/preview')
  importPreview(@UploadedFile() file: Express.Multer.File): Promise<ImportPreviewResultDto> {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    return this.service.parseImportPreview(file.buffer);
  }

  @ApiOperation({
    summary: 'Confirmar importación de filas válidas previamente parseadas',
    description:
      'Vuelve a validar que existan los cargos y especialidades y las reglas de cada cargo en TODAS las filas. ' +
      'Si alguna fila no las cumple, no se importa nada (400). Las filas cuyo DNI o email ya existen se saltean.',
  })
  @ApiResponse({ status: 201, type: ImportConfirmResultDto })
  @ApiResponse({ status: 400, description: 'Alguna fila viola las reglas de los cargos o tiene datos inválidos' })
  @Post('import/confirm')
  importConfirm(@Body() dto: ImportConfirmDto): Promise<ImportConfirmResultDto> {
    return this.service.confirmImport(dto);
  }
}