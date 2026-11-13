import { Injectable, NotFoundException, GoneException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PasswordResetTokenEntity } from '../entities/password-reset-token.entity.js';
import type { IPasswordResetTokenService } from './password-reset-token.service.interface.js';

@Injectable()
export class PasswordResetTokenService implements IPasswordResetTokenService {
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(PasswordResetTokenEntity)
    private readonly repo: Repository<PasswordResetTokenEntity>,
    private readonly configService: ConfigService,
  ) {
    this.ttlMs = parseInt(
      this.configService.get<string>('PASSWORD_RESET_TOKEN_TTL_MS') ?? '86400000',
      10,
    );
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async generate(studentId: string, purpose: 'setup' | 'reset'): Promise<string> {
    const plain = randomBytes(32).toString('hex');
    await this.repo.save({
      tokenHash: this.hash(plain),
      studentId,
      purpose,
      expiresAt: new Date(Date.now() + this.ttlMs),
    });
    return plain;
  }

  async consume(token: string): Promise<{ studentId: string; purpose: 'setup' | 'reset' }> {
    const tokenHash = this.hash(token);

    const result = await this.repo
      .createQueryBuilder()
      .update(PasswordResetTokenEntity)
      .set({ used: true })
      .where('"tokenHash" = :tokenHash', { tokenHash })
      .andWhere('used = false')
      .andWhere('"expiresAt" > :now', { now: new Date() })
      .returning('*')
      .execute();

    if (result.affected === 0) {
      const existing = await this.repo.findOne({ where: { tokenHash } });
      if (!existing) throw new NotFoundException('El link no es válido.');
      if (existing.used) throw new GoneException('Este link ya fue utilizado.');
      throw new GoneException('Este link ha expirado.');
    }

    const raw = result.raw as PasswordResetTokenEntity[];
    return { studentId: raw[0].studentId, purpose: raw[0].purpose };
  }
}