export interface IAdminPasswordConfirmService {
  /**
   * Confirma una operación sensible pidiendo la contraseña del admin que la ejecuta (step-up).
   * Si un token de admin fue robado, sin la contraseña no alcanza para cambiar datos de usuarios.
   *
   *  - Registra el intento ANTES de comparar (los intentos en paralelo también cuentan).
   *  - Contraseña incorrecta → 403 con attemptsRemaining y retryAfterSeconds (403 y no 401: el 401 hace
   *    que el panel renueve la sesión y repita el request, gastando dos intentos).
   *  - Demasiados intentos → 429 con code ADMIN_PASSWORD_ATTEMPTS_LOCKED y retryAfterSeconds.
   *  - Contraseña correcta → reinicia el contador.
   */
  verify(adminId: string, password: string): Promise<void>;
}
