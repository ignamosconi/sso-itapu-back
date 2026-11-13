export declare class CredentialTokenEntity {
    id: string;
    tokenHash: string;
    oauthClientId: number;
    encryptedSecret: string;
    clientName: string;
    redirectUris: string;
    used: boolean;
    expiresAt: Date;
    createdAt: Date;
}
