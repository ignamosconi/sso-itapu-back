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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto = __importStar(require("crypto"));
const crypto_1 = require("crypto");
const refresh_token_entity_js_1 = require("../entities/refresh-token.entity.js");
let RefreshTokenService = class RefreshTokenService {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    hash(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
    toDate(expiresIn) {
        const unit = expiresIn.slice(-1);
        const amount = parseInt(expiresIn.slice(0, -1), 10);
        const ms = unit === 's' ? amount * 1000
            : unit === 'm' ? amount * 60 * 1000
                : unit === 'h' ? amount * 60 * 60 * 1000
                    : unit === 'd' ? amount * 60 * 60 * 24 * 1000
                        : parseInt(expiresIn, 10) * 1000;
        return new Date(Date.now() + ms);
    }
    async save(params) {
        await this.repo.save({
            tokenHash: this.hash(params.token),
            familyId: params.familyId ?? (0, crypto_1.randomUUID)(),
            sub: params.sub,
            type: params.type,
            expiresAt: this.toDate(params.expiresIn),
            sessionExpiresAt: params.sessionExpiresAt ?? null,
            clientId: params.clientId ?? null,
        });
    }
    async consume(token) {
        const tokenHash = this.hash(token);
        const result = await this.repo
            .createQueryBuilder()
            .update(refresh_token_entity_js_1.RefreshTokenEntity)
            .set({ used: true })
            .where('tokenHash = :tokenHash', { tokenHash })
            .andWhere('used = false')
            .andWhere('revoked = false')
            .returning('*')
            .execute();
        if (result.affected === 0) {
            const existing = await this.repo.findOne({ where: { tokenHash } });
            if (existing?.used) {
                await this.repo.update({ familyId: existing.familyId }, { revoked: true });
                throw new common_1.UnauthorizedException('Refresh token ya utilizado. Sesión revocada por seguridad.');
            }
            throw new common_1.UnauthorizedException('Refresh token inválido o revocado.');
        }
        const raw = result.raw;
        const record = raw[0];
        const now = new Date();
        if (new Date(record.expiresAt) < now) {
            await this.repo.update({ familyId: record.familyId }, { revoked: true });
            throw new common_1.UnauthorizedException('Refresh token expirado.');
        }
        if (record.sessionExpiresAt && new Date(record.sessionExpiresAt) < now) {
            await this.repo.update({ familyId: record.familyId }, { revoked: true });
            throw new common_1.UnauthorizedException('La sesión expiró. Volvé a iniciar sesión.');
        }
        return record;
    }
    async revokeFamily(token) {
        const tokenHash = this.hash(token);
        const record = await this.repo.findOne({ where: { tokenHash } });
        if (!record)
            return;
        await this.repo.update({ familyId: record.familyId }, { revoked: true });
    }
    async revokeAllForSub(sub, manager) {
        const repo = manager ? manager.getRepository(refresh_token_entity_js_1.RefreshTokenEntity) : this.repo;
        await repo.update({ sub, revoked: false }, { revoked: true });
    }
    async revokeAllForClient(clientId, manager) {
        const repo = manager ? manager.getRepository(refresh_token_entity_js_1.RefreshTokenEntity) : this.repo;
        await repo.update({ clientId, revoked: false }, { revoked: true });
    }
    async purgeExpired() {
        await this.repo
            .createQueryBuilder()
            .delete()
            .where('"expiresAt" < :now', { now: new Date() })
            .execute();
    }
};
exports.RefreshTokenService = RefreshTokenService;
exports.RefreshTokenService = RefreshTokenService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(refresh_token_entity_js_1.RefreshTokenEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], RefreshTokenService);
//# sourceMappingURL=refresh-token.service.js.map