export type ChallengeConsumeResult = {
    ok: true;
} | {
    ok: false;
    reason: 'not_found' | 'max_attempts' | 'redis_unavailable';
};
export interface IPendingChallengeService {
    create(jti: string, adminId: string, purpose: '2fa-setup' | '2fa-confirm'): Promise<void>;
    verify(jti: string, expectedPurpose: '2fa-setup' | '2fa-confirm'): Promise<{
        adminId: string;
    }>;
    consume(jti: string, expectedPurpose: '2fa-setup' | '2fa-confirm'): Promise<{
        adminId: string;
    }>;
    recordAttempt(jti: string, expectedPurpose: '2fa-setup' | '2fa-confirm', totpValid: boolean): Promise<ChallengeConsumeResult>;
}
