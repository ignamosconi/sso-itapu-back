import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import type { CodeEntry, ICodeService } from './code.service.interface.js';
import { UserInfoOauthDto } from '../../auth/dtos/user-info-oauth.dto.js';

const KEY_PREFIX = 'sso:code:';

/**
 * Los authorization codes viven en Redis (no en memoria del proceso): sobreviven a un reinicio y
 * funcionan con más de una instancia del backend. GETDEL hace el canje atómico y de un solo uso.
 */
@Injectable()
export class CodeService implements ICodeService {
  private readonly ttlMs: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.ttlMs = parseInt(this.configService.getOrThrow<string>('CODE_TTL_MS'), 10);
  }

  async generate(userInfo: UserInfoOauthDto, clientId: number, redirectUri: string): Promise<string> {
    const code = randomBytes(32).toString('hex');
    const entry: CodeEntry = { userInfo, clientId, redirectUri };
    await this.redis.set(KEY_PREFIX + code, JSON.stringify(entry), 'PX', this.ttlMs);
    return code;
  }

  async consume(code: string): Promise<CodeEntry | null> {
    const raw = await this.redis.getdel(KEY_PREFIX + code);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CodeEntry;
    } catch {
      return null;
    }
  }
}
