import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import type { ILoginAttemptsService } from './login-attempts.service.interface.js';

export const LOGIN_LOCKED_CODE = 'LOGIN_ATTEMPTS_LOCKED';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutos

// Igual que en PasswordAttemptsService: INCR + EXPIRE atómicos para que nunca quede una clave sin vencimiento.
// Al llegar al máximo se reinicia el vencimiento (el bloqueo dura la ventana completa); insistir después no lo alarga.
const REGISTER_FAILURE_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 or c == tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return c
`;

/**
 * Bloqueo de login POR CUENTA (P2). Complementa el throttle por IP: un atacante que rota IPs
 * ya no puede probar contraseñas ilimitadas contra un mismo usuario.
 * Usa su propia clave (distinta de student:password-attempts:*, que protege borrar cuenta / cambiar email),
 * y se indexa por username normalizado aunque la cuenta no exista, para no revelar qué usuarios existen.
 */
@Injectable()
export class LoginAttemptsService implements ILoginAttemptsService {
  private readonly maxAttempts: number;
  private readonly windowSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.maxAttempts = this.readPositiveInt('LOGIN_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
    this.windowSeconds = Math.ceil(this.readPositiveInt('LOGIN_LOCK_TTL_MS', DEFAULT_LOCK_TTL_MS) / 1000);
  }

  private readPositiveInt(name: string, fallback: number): number {
    const raw = this.configService.get<string>(name);
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`[Config] ${name} debe ser un entero positivo (valor recibido: "${raw}").`);
    }
    return value;
  }

  private key(username: string): string {
    return `sso:login-attempts:${username.trim().toLowerCase()}`;
  }

  async assertNotLocked(username: string): Promise<void> {
    const key = this.key(username);
    const raw = await this.redis.get(key);
    if (Number(raw ?? 0) < this.maxAttempts) return;
    const ttl = await this.redis.ttl(key);
    const retryAfterSeconds = ttl > 0 ? ttl : this.windowSeconds;
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: LOGIN_LOCKED_CODE,
        message: 'Demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async registerFailure(username: string): Promise<void> {
    await this.redis.eval(REGISTER_FAILURE_SCRIPT, 1, this.key(username), this.windowSeconds, this.maxAttempts);
  }

  async reset(username: string): Promise<void> {
    await this.redis.del(this.key(username));
  }
}
