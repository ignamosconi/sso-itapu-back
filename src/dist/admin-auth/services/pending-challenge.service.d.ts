import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { IPendingChallengeService, ChallengeConsumeResult } from './pending-challenge.service.interface.js';
export declare class PendingChallengeService implements IPendingChallengeService {
    private readonly redis;
    private readonly configService;
    private readonly ttlMs;
    private readonly maxAttempts;
    constructor(redis: Redis, configService: ConfigService);
    private key;
    create(jti: string, adminId: string, purpose: '2fa-setup' | '2fa-confirm'): Promise<void>;
    verify(jti: string, expectedPurpose: '2fa-setup' | '2fa-confirm'): Promise<{
        adminId: string;
    }>;
    consume(jti: string, expectedPurpose: '2fa-setup' | '2fa-confirm'): Promise<{
        adminId: string;
    }>;
    recordAttempt(jti: string, expectedPurpose: '2fa-setup' | '2fa-confirm', totpValid: boolean): Promise<ChallengeConsumeResult>;
}
