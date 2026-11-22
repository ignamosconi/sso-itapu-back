import type { PasswordLockStatusDto } from '../dtos/password-lock-status.dto.js';

export interface PasswordAttemptResult {
  /** Intentos que le quedan al alumno antes de quedar bloqueado (0 = este fue el último). */
  attemptsRemaining: number;
  /** Segundos que dura todavía la ventana de conteo (si attemptsRemaining es 0, es la espera del bloqueo). */
  retryAfterSeconds: number;
}

export interface IPasswordAttemptsService {
  /**
   * Registra un intento de verificación de contraseña contra un alumno.
   * Lanza HttpException 429 (code PASSWORD_ATTEMPTS_LOCKED) si ya superó el máximo.
   * Debe llamarse ANTES de comparar la contraseña.
   */
  registerAttempt(studentId: string): Promise<PasswordAttemptResult>;

  /** Dice si el alumno está bloqueado, sin consumir ningún intento. */
  getLockStatus(studentId: string): Promise<PasswordLockStatusDto>;

  /** Borra el contador del alumno (se llama cuando la contraseña fue correcta). */
  reset(studentId: string): Promise<void>;
}