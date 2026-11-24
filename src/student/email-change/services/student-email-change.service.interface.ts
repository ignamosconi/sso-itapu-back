import type { RequestEmailChangeDto } from '../dtos/request-email-change.dto.js';

export interface IStudentEmailChangeService {
  /**
   * Inicia el cambio de email de un alumno activo: verifica su contraseña (con el mismo bloqueo
   * por intentos que la baja), guarda la solicitud y manda el link de confirmación al email NUEVO
   * y un aviso al email actual.
   */
  requestEmailChange(studentId: string, dto: RequestEmailChangeDto): Promise<void>;

  /**
   * Confirma el cambio con el token enviado al email nuevo: actualiza el email, cierra todas las
   * sesiones del alumno e invalida sus links de restaurar contraseña pendientes.
   */
  confirmEmailChange(token: string): Promise<void>;

  /** Borra solicitudes vencidas (tarea programada). */
  purgeExpired(): Promise<void>;
}