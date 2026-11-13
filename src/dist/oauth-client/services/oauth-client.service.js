"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthClientService = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redis_module_js_1 = require("../../redis/redis.module.js");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const generate_credential_token_dto_js_1 = require("../../credential-token/dtos/generate-credential-token.dto.js");
const oauth_client_entity_js_1 = require("../entities/oauth-client.entity.js");
const BCRYPT_ROUNDS = 10;
let OAuthClientService = class OAuthClientService {
    clientRepository;
    configService;
    credentialTokenService;
    refreshTokenService;
    redis;
    mailService;
    constructor(clientRepository, configService, credentialTokenService, refreshTokenService, redis, mailService) {
        this.clientRepository = clientRepository;
        this.configService = configService;
        this.credentialTokenService = credentialTokenService;
        this.refreshTokenService = refreshTokenService;
        this.redis = redis;
        this.mailService = mailService;
    }
    pendingSecretKey(clientId) {
        return `pending-secret:${clientId}`;
    }
    async storePendingSecret(clientId, plainSecret) {
        const ttlMs = this.configService.getOrThrow('CREDENTIAL_TOKEN_TTL_MS');
        await this.redis.set(this.pendingSecretKey(clientId), plainSecret, 'PX', ttlMs);
    }
    async consumePendingSecret(clientId) {
        const secret = await this.redis.getdel(this.pendingSecretKey(clientId));
        if (!secret) {
            throw new common_1.BadRequestException('El secret ya fue utilizado o expiró. Regenerá el secret para obtener uno nuevo.');
        }
        return secret;
    }
    toResponseDto(entity) {
        return {
            id: entity.id,
            clientName: entity.clientName,
            redirectUris: entity.redirectUris,
            isActive: entity.isActive,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }
    toCreatedResponseDto(entity, plainSecret) {
        return {
            id: entity.id,
            clientName: entity.clientName,
            redirectUris: entity.redirectUris,
            plainSecret,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }
    async findAll() {
        const entities = await this.clientRepository.find();
        return entities.map(e => this.toResponseDto(e));
    }
    async findOne(id) {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
        return this.toResponseDto(client);
    }
    async findInfo(id) {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
        return { clientName: client.clientName };
    }
    async validateClient(id, secret, redirectUri) {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            return false;
        if (!client.isActive)
            return false;
        const secretValid = await bcrypt.compare(secret, client.clientSecret);
        if (!secretValid)
            return false;
        if (!client.redirectUris.includes(redirectUri))
            return false;
        return true;
    }
    async create(dto) {
        const plainSecret = (0, crypto_1.randomBytes)(32).toString('hex');
        const clientSecret = await bcrypt.hash(plainSecret, BCRYPT_ROUNDS);
        const entity = this.clientRepository.create({ ...dto, clientSecret });
        const saved = await this.clientRepository.save(entity);
        await this.storePendingSecret(saved.id, plainSecret);
        return this.toCreatedResponseDto(saved, plainSecret);
    }
    async update(id, dto) {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
        Object.assign(client, dto);
        const saved = await this.clientRepository.save(client);
        return this.toResponseDto(saved);
    }
    async remove(id) {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
        await this.clientRepository.manager.transaction(async (manager) => {
            await this.refreshTokenService.revokeAllForClient(id, manager);
            await manager.remove(client);
        });
    }
    async regenerateSecret(id) {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
        const plainSecret = (0, crypto_1.randomBytes)(32).toString('hex');
        client.clientSecret = await bcrypt.hash(plainSecret, BCRYPT_ROUNDS);
        const saved = await this.clientRepository.save(client);
        await this.storePendingSecret(saved.id, plainSecret);
        return this.toCreatedResponseDto(saved, plainSecret);
    }
    async sendCredentialsByEmail(id, to) {
        const plainSecret = await this.consumePendingSecret(id);
        const credentialTokenTtlMs = this.configService.getOrThrow('CREDENTIAL_TOKEN_TTL_MS');
        const credentialTokenTtlHours = credentialTokenTtlMs / (1000 * 60 * 60);
        const credentialTokenTtlText = Number.isInteger(credentialTokenTtlHours)
            ? `${credentialTokenTtlHours} hora${credentialTokenTtlHours === 1 ? '' : 's'}`
            : `${credentialTokenTtlHours.toFixed(1)} horas`;
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
        const from = this.configService.getOrThrow('MAIL_FROM');
        const ssoUrl = this.configService.getOrThrow('SSO_BASE_URL');
        const generateDto = new generate_credential_token_dto_js_1.GenerateCredentialTokenDto();
        Object.assign(generateDto, {
            oauthClientId: client.id,
            plainSecret,
            clientName: client.clientName,
            redirectUris: client.redirectUris,
        });
        const token = await this.credentialTokenService.generate(generateDto);
        const credentialsUrl = `${ssoUrl}/credentials/${token}`;
        const urisList = client.redirectUris.map(uri => `  • ${uri}`).join('\n');
        try {
            await this.mailService.send(to, `Credenciales OAuth - ${client.clientName}`, {
                text: [
                    `Credenciales de integración SSO ITAPU para: ${client.clientName}`,
                    '',
                    '── Tu link de credenciales ─────────────────────────────',
                    '',
                    `${credentialsUrl}`,
                    '',
                    `⚠️  Este link es de UN SOLO USO y expira en ${credentialTokenTtlText}.`,
                    'Abrilo, guardá el Client Secret en un lugar seguro y no lo compartas.',
                    '',
                    '── Datos conocidos de tu cliente OAuth ─────────────────',
                    `Client ID:   ${client.id}`,
                    `Client Name: ${client.clientName}`,
                    '',
                    'Redirect URIs registradas:',
                    urisList,
                    '',
                    '── Cómo integrar tu app con el SSO ────────────────────',
                    '',
                    '1. Abrí un popup al login del SSO (puede ser con theme=light o theme=dark):',
                    `   ${ssoUrl}/sso/login?client_id=${client.id}&redirect_uri=TU_REDIRECT_URI&state=VALOR_ALEATORIO&theme=dark`,
                    '',
                    '2. Escuchá el postMessage en tu app:',
                    '   window.addEventListener("message", (event) => {',
                    `     if (event.origin !== "${ssoUrl}") return;`,
                    '     const { code, state } = event.data;',
                    '     // Verificá que state coincida con el que generaste',
                    '     // Mandá el code a tu backend',
                    '   });',
                    '',
                    '3. Desde tu backend, canjeá el code por tokens:',
                    `   POST ${ssoUrl}/sso/token`,
                    '   {',
                    `     "client_id": "${client.id}",`,
                    '     "client_secret": "TU_CLIENT_SECRET",',
                    '     "code": "EL_CODE_RECIBIDO",',
                    '     "redirect_uri": "TU_REDIRECT_URI"',
                    '   }',
                    '',
                    '4. Usá el access_token para identificar al usuario:',
                    `   GET ${ssoUrl}/sso/me`,
                    '   Authorization: Bearer ACCESS_TOKEN',
                    '',
                    '5. Renovar el access_token cuando expire (cada 15 minutos):',
                    `   POST ${ssoUrl}/sso/refresh`,
                    '   { "refresh_token": "TU_REFRESH_TOKEN" }',
                    '   → Obtenés un nuevo access_token Y un nuevo refresh_token.',
                    '   → IMPORTANTE: reemplazá AMBOS tokens almacenados con los nuevos.',
                    '   → El refresh_token anterior queda inválido tras el canje.',
                    '',
                    '6. Cerrar sesión del alumno voluntariamente:',
                    `   POST ${ssoUrl}/sso/logout`,
                    '   { "refresh_token": "TU_REFRESH_TOKEN" }',
                    '   → Además de llamar a este endpoint, eliminá la sesión local de tu aplicación.',
                    '',
                    '── Notas importantes ────────────────',
                    '• Nunca guardes el Client Secret en el frontend.',
                    '• Guardá los tokens de forma segura en tu backend (cookies HttpOnly recomendadas).',
                    '• El code de autorización es de un solo uso y expira en 2 minutos.',
                    '• Verificá siempre que el state devuelto coincida con el que generaste.',
                    '• Si perdés el Client Secret, pedile al administrador que lo regenere.',
                ].join('\n'),
            });
        }
        catch {
            throw new common_1.BadRequestException('Error al enviar el correo. Verificá la configuración de email.');
        }
    }
    async suspend(id) {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
        await this.refreshTokenService.revokeAllForClient(id);
        client.isActive = false;
        const saved = await this.clientRepository.save(client);
        return this.toResponseDto(saved);
    }
    async activate(id) {
        const client = await this.clientRepository.findOne({ where: { id } });
        if (!client)
            throw new common_1.NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
        client.isActive = true;
        const saved = await this.clientRepository.save(client);
        return this.toResponseDto(saved);
    }
};
exports.OAuthClientService = OAuthClientService;
exports.OAuthClientService = OAuthClientService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(oauth_client_entity_js_1.OAuthClientEntity)),
    __param(2, (0, common_1.Inject)('ICredentialTokenService')),
    __param(3, (0, common_1.Inject)('IRefreshTokenService')),
    __param(4, (0, common_1.Inject)(redis_module_js_1.REDIS_CLIENT)),
    __param(5, (0, common_1.Inject)('IMailService')),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        config_1.ConfigService, Object, Object, ioredis_1.default, Object])
], OAuthClientService);
//# sourceMappingURL=oauth-client.service.js.map