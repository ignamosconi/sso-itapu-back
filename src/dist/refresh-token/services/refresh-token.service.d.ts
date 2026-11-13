import { EntityManager, Repository } from 'typeorm';
import { RefreshTokenEntity } from '../entities/refresh-token.entity.js';
import { IRefreshTokenService, SaveRefreshTokenParams } from './refresh-token.service.interface.js';
export declare class RefreshTokenService implements IRefreshTokenService {
    private readonly repo;
    constructor(repo: Repository<RefreshTokenEntity>);
    private hash;
    private toDate;
    save(params: SaveRefreshTokenParams): Promise<void>;
    consume(token: string): Promise<RefreshTokenEntity>;
    revokeFamily(token: string): Promise<void>;
    revokeAllForSub(sub: string, manager?: EntityManager): Promise<void>;
    revokeAllForClient(clientId: number, manager?: EntityManager): Promise<void>;
    purgeExpired(): Promise<void>;
}
