import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CredentialTokenEntity } from '../entities/credential-token.entity.js';
import { ICredentialTokenService } from './credential-token.service.interface.js';
import { GenerateCredentialTokenDto } from '../dtos/generate-credential-token.dto.js';
import { ConsumeCredentialTokenResultDto } from '../dtos/consume-credential-token-result.dto.js';
export declare class CredentialTokenService implements ICredentialTokenService {
    private readonly repo;
    private readonly configService;
    private readonly encryptionKey;
    private readonly ttlMs;
    constructor(repo: Repository<CredentialTokenEntity>, configService: ConfigService);
    private hashToken;
    private encrypt;
    private decrypt;
    generate(dto: GenerateCredentialTokenDto): Promise<string>;
    consume(token: string): Promise<ConsumeCredentialTokenResultDto>;
}
