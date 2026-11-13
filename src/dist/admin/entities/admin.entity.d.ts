export declare class AdminEntity {
    id: string;
    username: string;
    password: string;
    totpSecret: string | null;
    totpEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}
