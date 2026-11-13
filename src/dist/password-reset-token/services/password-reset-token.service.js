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
exports.PasswordResetTokenService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const config_1 = require("@nestjs/config");
const password_reset_token_entity_js_1 = require("../entities/password-reset-token.entity.js");
let PasswordResetTokenService = class PasswordResetTokenService {
    repo;
    configService;
    ttlMs;
    constructor(repo, configService) {
        this.repo = repo;
        this.configService = configService;
        this.ttlMs = parseInt(this.configService.get('PASSWORD_RESET_TOKEN_TTL_MS') ?? '86400000', 10);
    }
    hash(token) {
        return (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    async generate(studentId, purpose) {
        const plain = (0, crypto_1.randomBytes)(32).toString('hex');
        await this.repo.save({
            tokenHash: this.hash(plain),
            studentId,
            purpose,
            expiresAt: new Date(Date.now() + this.ttlMs),
        });
        return plain;
    }
    async consume(token) {
        const tokenHash = this.hash(token);
        const result = await this.repo
            .createQueryBuilder()
            .update(password_reset_token_entity_js_1.PasswordResetTokenEntity)
            .set({ used: true })
            .where('"tokenHash" = :tokenHash', { tokenHash })
            .andWhere('used = false')
            .andWhere('"expiresAt" > :now', { now: new Date() })
            .returning('*')
            .execute();
        if (result.affected === 0) {
            const existing = await this.repo.findOne({ where: { tokenHash } });
            if (!existing)
                throw new common_1.NotFoundException('El link no es válido.');
            if (existing.used)
                throw new common_1.GoneException('Este link ya fue utilizado.');
            throw new common_1.GoneException('Este link ha expirado.');
        }
        const raw = result.raw;
        return { studentId: raw[0].studentId, purpose: raw[0].purpose };
    }
};
exports.PasswordResetTokenService = PasswordResetTokenService;
exports.PasswordResetTokenService = PasswordResetTokenService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(password_reset_token_entity_js_1.PasswordResetTokenEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        config_1.ConfigService])
], PasswordResetTokenService);
//# sourceMappingURL=password-reset-token.service.js.map