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
exports.AdminAuthService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const crypto_1 = require("crypto");
const crypto_2 = require("crypto");
const otplib_1 = require("otplib");
const QRCode = __importStar(require("qrcode"));
const admin_entity_js_1 = require("../../admin/entities/admin.entity.js");
let AdminAuthService = class AdminAuthService {
    adminRepository;
    jwtService;
    configService;
    refreshTokenService;
    pendingChallengeService;
    accessSecret;
    refreshSecret;
    pendingSecret;
    accessExpiresIn;
    refreshExpiresIn;
    totpEncryptionKey;
    pendingTtlMs;
    constructor(adminRepository, jwtService, configService, refreshTokenService, pendingChallengeService) {
        this.adminRepository = adminRepository;
        this.jwtService = jwtService;
        this.configService = configService;
        this.refreshTokenService = refreshTokenService;
        this.pendingChallengeService = pendingChallengeService;
        this.accessSecret = this.configService.getOrThrow('JWT_ADMIN_ACCESS_SECRET');
        this.refreshSecret = this.configService.getOrThrow('JWT_ADMIN_REFRESH_SECRET');
        this.pendingSecret = this.accessSecret;
        this.accessExpiresIn = this.configService.getOrThrow('JWT_ADMIN_ACCESS_EXPIRES_IN');
        this.refreshExpiresIn = this.configService.getOrThrow('JWT_ADMIN_REFRESH_EXPIRES_IN');
        this.pendingTtlMs = parseInt(this.configService.getOrThrow('PENDING_2FA_TTL_MS'), 10);
        const keyHex = this.configService.getOrThrow('TOTP_ENCRYPTION_KEY');
        if (keyHex.length !== 64) {
            throw new Error('TOTP_ENCRYPTION_KEY debe ser exactamente 64 caracteres hex (32 bytes).');
        }
        this.totpEncryptionKey = Buffer.from(keyHex, 'hex');
    }
    encryptTotp(plain) {
        const iv = (0, crypto_1.randomBytes)(12);
        const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', this.totpEncryptionKey, iv);
        const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    }
    decryptTotp(stored) {
        const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const ciphertext = Buffer.from(ciphertextHex, 'hex');
        const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', this.totpEncryptionKey, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }
    async issuePendingToken(adminId, purpose) {
        const jti = (0, crypto_2.randomUUID)();
        const ttlSeconds = Math.floor(this.pendingTtlMs / 1000);
        await this.pendingChallengeService.create(jti, adminId, purpose);
        return this.jwtService.signAsync({ sub: adminId, jti, purpose, type: 'pending-2fa' }, { secret: this.pendingSecret, expiresIn: ttlSeconds });
    }
    async verifyPendingToken(token, expectedPurpose) {
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(token, {
                secret: this.pendingSecret,
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Token de sesión pendiente inválido o expirado.');
        }
        if (payload.type !== 'pending-2fa') {
            throw new common_1.UnauthorizedException('Token inválido.');
        }
        await this.pendingChallengeService.verify(payload.jti, expectedPurpose);
        return { sub: payload.sub, jti: payload.jti };
    }
    async issueTokenPair(admin) {
        const [access_token, refresh_token] = await Promise.all([
            this.jwtService.signAsync({ sub: admin.id, username: admin.username, type: 'access' }, { secret: this.accessSecret, expiresIn: this.accessExpiresIn }),
            this.jwtService.signAsync({ sub: admin.id, type: 'refresh', jti: (0, crypto_2.randomUUID)() }, { secret: this.refreshSecret, expiresIn: this.refreshExpiresIn }),
        ]);
        await this.refreshTokenService.save({
            token: refresh_token,
            sub: admin.id,
            type: 'admin',
            expiresIn: this.refreshExpiresIn,
        });
        return {
            access_token,
            refresh_token,
            token_type: 'Bearer',
            expires_in: this.parseExpiresIn(this.accessExpiresIn),
        };
    }
    async login(dto) {
        const admin = await this.adminRepository.findOne({ where: { username: dto.username } });
        if (!admin)
            throw new common_1.UnauthorizedException('Credenciales inválidas.');
        const valid = await bcrypt.compare(dto.password, admin.password);
        if (!valid)
            throw new common_1.UnauthorizedException('Credenciales inválidas.');
        const purpose = admin.totpEnabled ? '2fa-confirm' : '2fa-setup';
        const pending_token = await this.issuePendingToken(admin.id, purpose);
        return {
            pending_token,
            requires_2fa_setup: !admin.totpEnabled,
        };
    }
    async setup2fa(dto) {
        const { sub, jti } = await this.verifyPendingToken(dto.pending_token, '2fa-setup');
        const admin = await this.adminRepository.findOne({ where: { id: sub } });
        if (!admin)
            throw new common_1.UnauthorizedException('Admin no encontrado.');
        if (admin.totpEnabled) {
            throw new common_1.ForbiddenException('El 2FA ya está configurado. Para regenerarlo usá /admin/auth/2fa/reset.');
        }
        await this.pendingChallengeService.consume(jti, '2fa-setup');
        const plainSecret = otplib_1.authenticator.generateSecret();
        admin.totpSecret = this.encryptTotp(plainSecret);
        await this.adminRepository.save(admin);
        const otpAuthUrl = otplib_1.authenticator.keyuri(admin.username, 'SSO FRVM', plainSecret);
        const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
        const confirm_pending_token = await this.issuePendingToken(admin.id, '2fa-confirm');
        return {
            qrCodeDataUrl,
            manualEntrySecret: plainSecret,
            confirm_pending_token,
        };
    }
    async confirm2fa(dto) {
        const { sub, jti } = await this.verifyPendingToken(dto.pending_token, '2fa-confirm');
        const admin = await this.adminRepository.findOne({ where: { id: sub } });
        if (!admin || !admin.totpSecret) {
            throw new common_1.UnauthorizedException('Primero debés configurar el 2FA con /2fa/setup.');
        }
        const plainSecret = this.decryptTotp(admin.totpSecret);
        const totpValid = otplib_1.authenticator.verify({ token: dto.totp_code, secret: plainSecret });
        const result = await this.pendingChallengeService.recordAttempt(jti, '2fa-confirm', totpValid);
        if (!result.ok) {
            if (result.reason === 'redis_unavailable') {
                throw new common_1.ServiceUnavailableException('El servicio de autenticación no está disponible. Intentá de nuevo.');
            }
            if (result.reason === 'max_attempts') {
                throw new common_1.UnauthorizedException('Demasiados intentos fallidos. El proceso de verificación fue cancelado. Volvé a iniciar sesión.');
            }
            throw new common_1.UnauthorizedException('Código 2FA inválido.');
        }
        admin.totpEnabled = true;
        await this.adminRepository.save(admin);
        return this.issueTokenPair(admin);
    }
    async validate2fa(dto) {
        const { sub, jti } = await this.verifyPendingToken(dto.pending_token, '2fa-confirm');
        const admin = await this.adminRepository.findOne({ where: { id: sub } });
        if (!admin || !admin.totpEnabled || !admin.totpSecret) {
            throw new common_1.UnauthorizedException('2FA no configurado para este admin.');
        }
        const plainSecret = this.decryptTotp(admin.totpSecret);
        const totpValid = otplib_1.authenticator.verify({ token: dto.totp_code, secret: plainSecret });
        const result = await this.pendingChallengeService.recordAttempt(jti, '2fa-confirm', totpValid);
        if (!result.ok) {
            if (result.reason === 'redis_unavailable') {
                throw new common_1.ServiceUnavailableException('El servicio de autenticación no está disponible. Intentá de nuevo.');
            }
            if (result.reason === 'max_attempts') {
                throw new common_1.UnauthorizedException('Demasiados intentos fallidos. El proceso de verificación fue cancelado. Volvé a iniciar sesión.');
            }
            throw new common_1.UnauthorizedException('Código 2FA inválido.');
        }
        return this.issueTokenPair(admin);
    }
    async reset2fa(adminId, dto) {
        const admin = await this.adminRepository.findOne({ where: { id: adminId } });
        if (!admin)
            throw new common_1.UnauthorizedException('Admin no encontrado.');
        const valid = await bcrypt.compare(dto.password, admin.password);
        if (!valid)
            throw new common_1.UnauthorizedException('Password incorrecta.');
        admin.totpSecret = null;
        admin.totpEnabled = false;
        await this.adminRepository.save(admin);
    }
    async refresh(dto) {
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(dto.refresh_token, {
                secret: this.refreshSecret,
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Refresh token inválido o expirado.');
        }
        if (payload.type !== 'refresh') {
            throw new common_1.UnauthorizedException('El token proporcionado no es un refresh token.');
        }
        const record = await this.refreshTokenService.consume(dto.refresh_token);
        const admin = await this.adminRepository.findOne({ where: { id: payload.sub } });
        if (!admin)
            throw new common_1.UnauthorizedException('Admin no encontrado.');
        const [newAccessToken, newRefreshToken] = await Promise.all([
            this.jwtService.signAsync({ sub: admin.id, username: admin.username, type: 'access' }, { secret: this.accessSecret, expiresIn: this.accessExpiresIn }),
            this.jwtService.signAsync({ sub: admin.id, type: 'refresh', jti: (0, crypto_2.randomUUID)() }, { secret: this.refreshSecret, expiresIn: this.refreshExpiresIn }),
        ]);
        await this.refreshTokenService.save({
            token: newRefreshToken,
            sub: admin.id,
            type: 'admin',
            expiresIn: this.refreshExpiresIn,
            familyId: record.familyId,
        });
        return {
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_type: 'Bearer',
            expires_in: this.parseExpiresIn(this.accessExpiresIn),
        };
    }
    async logout(dto) {
        await this.refreshTokenService.revokeFamily(dto.refresh_token);
    }
    parseExpiresIn(value) {
        const unit = value.slice(-1);
        const amount = parseInt(value.slice(0, -1), 10);
        switch (unit) {
            case 's': return amount;
            case 'm': return amount * 60;
            case 'h': return amount * 60 * 60;
            case 'd': return amount * 60 * 60 * 24;
            default: return parseInt(value, 10);
        }
    }
};
exports.AdminAuthService = AdminAuthService;
exports.AdminAuthService = AdminAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(admin_entity_js_1.AdminEntity)),
    __param(3, (0, common_1.Inject)('IRefreshTokenService')),
    __param(4, (0, common_1.Inject)('IPendingChallengeService')),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        jwt_1.JwtService,
        config_1.ConfigService, Object, Object])
], AdminAuthService);
//# sourceMappingURL=admin-auth.service.js.map