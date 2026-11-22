import {
  Controller, Post, Body, Param, Inject, UseGuards, ParseUUIDPipe, HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IStudentEmailChangeController } from './student-email-change.controller.interface.js';
import type { IStudentEmailChangeService } from '../services/student-email-change.service.interface.js';
import { RequestEmailChangeDto } from '../dtos/request-email-change.dto.js';
import { ConfirmEmailChangeDto } from '../dtos/confirm-email-change.dto.js';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard.js';

// Lee un entero positivo del entorno cada vez que se evalúa el límite. Si la variable no
// está o es inválida se usa el valor por defecto.
const envInt = (name: string, fallback: number) => (): number => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

// Mismo prefijo que AuthController (los endpoints públicos del SSO).
const AUTH_ROUTE = process.env.AUTH_ROUTE_PATH || 'oauth';

// Este controller no lleva prefijo propio porque mezcla una ruta del panel (admin/students/...)
// con una pública del SSO. No usa @SkipThrottle: aplica el límite global salvo donde se indica.
@Controller()
export class StudentEmailChangeController implements IStudentEmailChangeController {
  constructor(
    @Inject('IStudentEmailChangeService')
    private readonly service: IStudentEmailChangeService,
  ) {}

  @ApiTags('Admin — Padrón de usuarios')
  @ApiBearerAuth('admin-jwt')
  @ApiOperation({
    summary: 'Pedir el cambio de email de un alumno',
    description:
      'Solo para alumnos activos. Requiere la contraseña del alumno (debe estar presente) y comparte ' +
      'con la baja el bloqueo por intentos de contraseña. Envía un link de confirmación al email NUEVO ' +
      'y un aviso al email actual. El cambio se aplica cuando el alumno confirma desde ese link.',
  })
  @ApiResponse({ status: 204, description: 'Link de confirmación enviado' })
  @ApiResponse({ status: 400, description: 'Cuenta no activa, email igual al actual o error al enviar el mail' })
  @ApiResponse({
    status: 403,
    description: 'Contraseña del alumno incorrecta (body: attemptsRemaining y retryAfterSeconds)',
  })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  @ApiResponse({ status: 409, description: 'El email ya está registrado por otro usuario' })
  @ApiResponse({
    status: 429,
    description:
      'Demasiados requests (header Retry-After) o demasiados intentos de contraseña ' +
      '(body: code PASSWORD_ATTEMPTS_LOCKED y retryAfterSeconds)',
  })
  @UseGuards(AdminJwtGuard)
  @Throttle({
    default: {
      ttl: envInt('STUDENT_EMAIL_CHANGE_THROTTLE_TTL_MS', 60_000),
      limit: envInt('STUDENT_EMAIL_CHANGE_THROTTLE_LIMIT', 10),
    },
  })
  @HttpCode(204)
  @Post('admin/students/:id/email-change')
  requestEmailChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestEmailChangeDto,
  ): Promise<void> {
    return this.service.requestEmailChange(id, dto);
  }

  @ApiTags('SSO — Alumnos')
  @ApiOperation({
    summary: 'Confirmar el cambio de email',
    description:
      'Consume el token de un solo uso enviado al email nuevo, actualiza el email, cierra todas las ' +
      'sesiones del alumno e invalida sus links de restaurar contraseña pendientes.',
  })
  @ApiResponse({ status: 204, description: 'Email actualizado' })
  @ApiResponse({ status: 400, description: 'La cuenta no está activa' })
  @ApiResponse({ status: 404, description: 'Token inexistente o cuenta eliminada' })
  @ApiResponse({ status: 409, description: 'El email ya fue registrado por otro usuario' })
  @ApiResponse({ status: 410, description: 'Token ya utilizado o expirado' })
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(204)
  @Post(`${AUTH_ROUTE}/confirm-email-change`)
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto): Promise<void> {
    return this.service.confirmEmailChange(dto.token);
  }
}