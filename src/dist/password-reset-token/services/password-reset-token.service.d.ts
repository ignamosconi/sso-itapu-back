import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PasswordResetTokenEntity } from '../entities/password-reset-token.entity.js';
import type { IPasswordResetTokenService } from './password-reset-token.service.interface.js';
export declare class PasswordResetTokenService implements IPasswordResetTokenService {
    private readonly repo;
    private readonly configService;
    private readonly ttlMs;
    constructor(repo: Repository<PasswordResetTokenEntity>, configService: ConfigService);
    private hash;
    generate(studentId: string, purpose: 'setup' | 'reset'): Promise<string>;
    consume(token: string): Promise<{
        studentId: string;
        purpose: 'setup' | 'reset';
    }>;
}
