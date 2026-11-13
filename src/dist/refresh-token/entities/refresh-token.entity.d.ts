export declare class RefreshTokenEntity {
    id: string;
    tokenHash: string;
    familyId: string;
    sub: string;
    type: string;
    used: boolean;
    revoked: boolean;
    expiresAt: Date;
    sessionExpiresAt: Date | null;
    clientId: number | null;
    createdAt: Date;
}
