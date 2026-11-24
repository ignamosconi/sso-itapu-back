export interface ILoginAttemptsService {
  /** Lanza 429 (con retryAfterSeconds) si la cuenta ya está bloqueada. No consume intentos. */
  assertNotLocked(username: string): Promise<void>;
  /** Registra un intento fallido. Funciona igual exista o no la cuenta (no filtra existencia). */
  registerFailure(username: string): Promise<void>;
  /** Limpia el contador tras un login correcto. */
  reset(username: string): Promise<void>;
}
