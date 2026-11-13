"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialTokenService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const config_1 = require("@nestjs/config");
const credential_token_entity_js_1 = require("../entities/credential-token.entity.js");
let CredentialTokenService = class CredentialTokenService {
    repo;
    configService;
    encryptionKey;
    ttlMs;
    constructor(repo, configService) {
        this.repo = repo;
        this.configService = configService;
        const keyHex = this.configService.getOrThrow('CREDENTIAL_ENCRYPTION_KEY');
        if (keyHex.length !== 64) {
            throw new Error('CREDENTIAL_ENCRYPTION_KEY debe ser exactamente 64 caracteres hex (32 bytes).');
        }
        this.encryptionKey = Buffer.from(keyHex, 'hex');
        this.ttlMs = parseInt(this.configService.get('CREDENTIAL_TOKEN_TTL_MS') ?? '86400000', 10);
    }
    hashToken(token) {
        return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    encrypt(plain) {
        const iv = (0, crypto_1.randomBytes)(12);
        const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', this.encryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    }
    decrypt(stored) {
        const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const ciphertext = Buffer.from(ciphertextHex, 'hex');
        const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }
    async generate(dto) {
        const plain = (0, crypto_1.randomBytes)(32).toString('hex');
        await this.repo.save({
            tokenHash: this.hashToken(plain),
            oauthClientId: dto.oauthClientId,
            encryptedSecret: this.encrypt(dto.plainSecret),
            clientName: dto.clientName,
            redirectUris: JSON.stringify(dto.redirectUris),
            expiresAt: new Date(Date.now() + this.ttlMs),
        });
        return plain;
    }
    async consume(token) {
        const tokenHash = this.hashToken(token);
        const result = await this.repo
            .createQueryBuilder()
            .update(credential_token_entity_js_1.CredentialTokenEntity)
            .set({ used: true })
            .where('"tokenHash" = :tokenHash', { tokenHash })
            .andWhere('used = false')
            .andWhere('"expiresAt" > :now', { now: new Date() })
            .returning('*')
            .execute();
        if (result.affected === 0) {
            const existing = await this.repo.findOne({ where: { tokenHash } });
            if (!existing) {
                throw new common_1.NotFoundException('El link no es válido.');
            }
            if (existing.used) {
                throw new common_1.GoneException('Este link ya fue utilizado.');
            }
            throw new common_1.GoneException('Este link ha expirado.');
        }
        const raw = result.raw;
        if (!Array.isArray(raw) || raw.length === 0) {
            throw new common_1.NotFoundException('No se pudo obtener el token.');
        }
        const record = raw[0];
        const parsedRedirectUris = JSON.parse(record.redirectUris);
        if (!Array.isArray(parsedRedirectUris) ||
            !parsedRedirectUris.every((uri) => typeof uri === 'string')) {
            throw new Error('Los redirect URIs almacenados no tienen un formato válido.');
        }
        return {
            oauthClientId: record.oauthClientId,
            plainSecret: this.decrypt(record.encryptedSecret),
            clientName: record.clientName,
            redirectUris: parsedRedirectUris,
        };
    }
};
exports.CredentialTokenService = CredentialTokenService;
exports.CredentialTokenService = CredentialTokenService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(credential_token_entity_js_1.CredentialTokenEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        config_1.ConfigService])
], CredentialTokenService);
//# sourceMappingURL=credential-token.service.js.map