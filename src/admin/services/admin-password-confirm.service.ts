import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { AdminEntity } from '../entities/admin.entity.js';
import type { IAdminPasswordConfirmService } from './admin-password-confirm.service.interface.js';

export const ADMIN_PASSWORD_ATTEMPTS_LOCKED_CODE = 'ADMIN_PASSWORD_ATTEMPTS_LOCKED';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000; // 15 minutos

// Mismo esquema atómico que el bloqueo de contraseña de alumnos (password-attempts.service.ts):
// INCR + EXPIRE en una sola operación para que nunca quede una clave sin vencimiento.
const REGISTER_ATTEMPT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 or c == tonumber(ARGV[2]) then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return { c, redis.call('TTL', KEYS[1]) }
`;

@Injectable()
export class AdminPasswordConfirmService implements IAdminPasswordConfirmService {
  private readonly maxAttempts: number;
  private readonly windowSeconds: number;

  constructor(
    @InjectRepository(AdminEntity) private readonly adminRepo: Repository<AdminEntity>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    configService: ConfigService,
  ) {
    this.maxAttempts = this.readPositiveInt(configService, 'ADMIN_CONFIRM_PASSWORD_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
    this.windowSeconds = Math.ceil(
      this.readPositiveInt(configService, 'ADMIN_CONFIRM_PASSWORD_LOCK_TTL_MS', DEFAULT_LOCK_TTL_MS) / 1000,
    );
  }

  // Sin definir → valor por defecto. Definida pero inválida → el servidor NO arranca (un límite de
  // seguridad mal escrito no debe quedar en silencio).
  private readPositiveInt(config: ConfigService, name: string, fallback: number): number {
    const raw = config.get<string>(name);
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`[Config] ${name} debe ser un entero positivo (valor recibido: "${raw}").`);
    }
    return value;
  }

  private key(adminId: string): string {
    return `admin:confirm-password-attempts:${adminId}`;
  }

  async verify(adminId: string, password: string): Promise<void> {
    const [count, ttl] = (await this.redis.eval(
      REGISTER_ATTEMPT_SCRIPT,
      1,
      this.key(adminId),
      this.windowSeconds,
      this.maxAttempts,
    )) as [number, number];
    const retryAfterSeconds = ttl > 0 ? ttl : this.windowSeconds;

    if (count > this.maxAttempts) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: ADMIN_PASSWORD_ATTEMPTS_LOCKED_CODE,
          message: 'Superaste el máximo de intentos de tu contraseña de administrador. Intentá de nuevo más tarde.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const admin = await this.adminRepo.findOne({ where: { id: adminId }, select: { id: true, password: true } });
    // El guard ya verificó que el admin existe; si desapareció entre medio, la sesión no es válida.
    if (!admin) throw new UnauthorizedException('Token de admin inválido o expirado.');

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Tu contraseña de administrador es incorrecta.',
        attemptsRemaining: this.maxAttempts - count,
        retryAfterSeconds,
      });
    }

    await this.redis.del(this.key(adminId));
  }
}
