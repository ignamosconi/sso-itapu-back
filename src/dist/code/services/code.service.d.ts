import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ICodeService } from './code.service.interface.js';
import { UserInfoOauthDto } from '../../auth/dtos/user-info-oauth.dto.js';
export declare class CodeService implements ICodeService, OnModuleDestroy {
    private readonly configService;
    private readonly codes;
    private readonly ttlMs;
    private readonly purgeInterval;
    constructor(configService: ConfigService);
    onModuleDestroy(): void;
    generate(userInfo: UserInfoOauthDto, clientId: number): string;
    consume(code: string): {
        userInfo: UserInfoOauthDto;
        clientId: number;
    } | null;
    private purgeExpired;
}
