export declare class PasswordResetTokenEntity {
    id: string;
    tokenHash: string;
    studentId: string;
    purpose: 'setup' | 'reset';
    used: boolean;
    expiresAt: Date;
    createdAt: Date;
}
