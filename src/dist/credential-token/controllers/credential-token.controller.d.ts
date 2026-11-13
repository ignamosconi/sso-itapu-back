import type { Response } from 'express';
import { ICredentialTokenController } from './credential-token.controller.interface.js';
import type { ICredentialTokenService } from '../services/credential-token.service.interface.js';
import { CredentialDataResponseDto } from '../dtos/credential-data-response.dto.js';
export declare class CredentialTokenController implements ICredentialTokenController {
    private readonly credentialTokenService;
    constructor(credentialTokenService: ICredentialTokenService);
    serveCredentialsPage(_token: string, res: Response): void;
    consumeCredentialData(token: string): Promise<CredentialDataResponseDto>;
}
