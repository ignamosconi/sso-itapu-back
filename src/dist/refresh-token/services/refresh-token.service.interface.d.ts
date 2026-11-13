import { RefreshTokenEntity } from '../entities/refresh-token.entity.js';
import { EntityManager } from 'typeorm';
export interface SaveRefreshTokenParams {
    token: string;
    sub: string;
    type: 'student' | 'admin';
    expiresIn: string;
    familyId?: string;
    sessionExpiresAt?: Date | null;
    clientId?: number;
}
export interface IRefreshTokenService {
    save(params: SaveRefreshTokenParams): Promise<void>;
    consume(token: string): Promise<RefreshTokenEntity>;
    revokeFamily(token: string): Promise<void>;
    revokeAllForSub(sub: string, manager?: EntityManager): Promise<void>;
    revokeAllForClient(clientId: number, manager?: EntityManager): Promise<void>;
    purgeExpired(): Promise<void>;
}
