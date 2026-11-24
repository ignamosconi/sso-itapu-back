import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../redis/redis.module.js';
import type { PasswordLockStatusDto } from '../dtos/password-lock-status.dto.js';
import type {
  IPasswordAttemptsService,
  PasswordAttemptResult,
} from './password-attempts.service.interface.js';

export const PASSWORD_ATTEMPTS_LOCKED_CODE = 'PASSWORD_ATTEMPTS_LOCKED';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutos

// Incrementa el contador y fija el vencimiento en UNA sola operación atómica,
// para que nunca quede una clave sin vencimiento (eso bloquearía al alumno para siempre).
//  - 1.er intento: abre la ventana de conteo.
//  - Intento número MAX: reinicia el vencimiento, así el bloqueo dura la ventana completa desde ese intento.
//  - Intentos posteriores (ya bloqueado): no tocan el vencimiento, para que insistir no alargue la espera.
const REGISTER_ATTEMPT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 or c == tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return { c, redis.call('TTL', KEYS[1]) }
`;

@Injectable()
export class PasswordAttemptsService implements IPasswordAttemptsService {
  private readonly maxAttempts: number;
  private readonly windowSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.maxAttempts = this.readPositiveInt('STUDENT_PASSWORD_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
    this.windowSeconds = Math.ceil(
      this.readPositiveInt('STUDENT_PASSWORD_LOCK_TTL_MS', DEFAULT_LOCK_TTL_MS) / 1000,
    );
  }

  // Si la variable no está definida se usa el valor por defecto; si está definida pero es
  // inválida, el servidor NO arranca: un límite de seguridad mal escrito no debe quedar en silencio.
  private readPositiveInt(name: string, fallback: number): number {
    const raw = this.configService.get<string>(name);
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`[Config] ${name} debe ser un entero positivo (valor recibido: "${raw}").`);
    }
    return value;
  }

  private key(studentId: string): string {
    return `student:password-attempts:${studentId}`;
  }

  async registerAttempt(studentId: string): Promise<PasswordAttemptResult> {
    const [count, ttl] = (await this.redis.eval(
      REGISTER_ATTEMPT_SCRIPT,
      1,
      this.key(studentId),
      this.windowSeconds,
      this.maxAttempts,
    )) as [number, number];

    const retryAfterSeconds = ttl > 0 ? ttl : this.windowSeconds;

    if (count > this.maxAttempts) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: PASSWORD_ATTEMPTS_LOCKED_CODE,
          message: 'Se superó el máximo de intentos de contraseña para este alumno. Intentá de nuevo más tarde.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return { attemptsRemaining: this.maxAttempts - count, retryAfterSeconds };
  }

  async getLockStatus(studentId: string): Promise<PasswordLockStatusDto> {
    const [rawCount, ttl] = await Promise.all([
      this.redis.get(this.key(studentId)),
      this.redis.ttl(this.key(studentId)),
    ]);
    // Con MAX intentos ya consumidos, el próximo se rechaza: el alumno está bloqueado.
    const locked = Number(rawCount ?? 0) >= this.maxAttempts;
    return { locked, retryAfterSeconds: locked ? (ttl > 0 ? ttl : this.windowSeconds) : 0 };
  }

  async reset(studentId: string): Promise<void> {
    await this.redis.del(this.key(studentId));
  }
}