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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const crypto_1 = require("crypto");
let AuthService = class AuthService {
    configService;
    jwtService;
    codeService;
    oauthClientService;
    refreshTokenService;
    studentService;
    passwordResetTokenService;
    mailService;
    accessSecret;
    refreshSecret;
    accessExpiresIn;
    refreshExpiresIn;
    sessionMaxDurationMs;
    adminPanelUrl;
    constructor(configService, jwtService, codeService, oauthClientService, refreshTokenService, studentService, passwordResetTokenService, mailService) {
        this.configService = configService;
        this.jwtService = jwtService;
        this.codeService = codeService;
        this.oauthClientService = oauthClientService;
        this.refreshTokenService = refreshTokenService;
        this.studentService = studentService;
        this.passwordResetTokenService = passwordResetTokenService;
        this.mailService = mailService;
        this.accessSecret = this.configService.getOrThrow('JWT_ACCESS_SECRET');
        this.refreshSecret = this.configService.getOrThrow('JWT_REFRESH_SECRET');
        this.accessExpiresIn = this.configService.getOrThrow('JWT_ACCESS_EXPIRES_IN');
        this.refreshExpiresIn = this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN');
        this.sessionMaxDurationMs =
            this.parseExpiresIn(this.configService.getOrThrow('JWT_REFRESH_SESSION_MAX_DURATION')) * 1000;
        this.adminPanelUrl = this.configService.getOrThrow('ADMIN_PANEL_URL');
    }
    maskEmail(email) {
        const [local, domain] = email.split('@');
        return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
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
    async validateAndGetUserInfo(loginDto) {
        const student = await this.studentService.findForAuth(loginDto.username);
        if (!student)
            throw new common_1.UnauthorizedException('Credenciales inválidas.');
        if (!student.password) {
            throw new common_1.UnauthorizedException('Tu cuenta aún no tiene contraseña configurada. Revisá tu correo electrónico.');
        }
        if (student.account_status === 'suspended') {
            throw new common_1.UnauthorizedException('Tu cuenta está suspendida. Contactá a un administrador.');
        }
        if (student.account_status === 'pending_registration') {
            throw new common_1.UnauthorizedException('Tu cuenta está pendiente de activación. Revisá tu correo electrónico.');
        }
        const valid = await bcrypt.compare(loginDto.password, student.password);
        if (!valid)
            throw new common_1.UnauthorizedException('Credenciales inválidas.');
        return {
            sub: student.id,
            nombre: student.first_name,
            apellido: student.last_name,
            legajo: student.username,
            carrera: student.specialtyName,
            email: student.email,
            grupo: student.domainRoleName,
        };
    }
    async checkUsername(dto) {
        const student = await this.studentService.findForAuth(dto.username);
        if (!student)
            throw new common_1.NotFoundException('Usuario no encontrado.');
        if (student.account_status === 'suspended') {
            throw new common_1.UnauthorizedException('Tu cuenta está suspendida. Contactá a un administrador.');
        }
        if (!student.password) {
            const token = await this.passwordResetTokenService.generate(student.id, 'setup');
            const link = `${this.adminPanelUrl}/set-password?token=${token}`;
            void this.mailService.send(student.email, 'Configurá tu contraseña — ITAPU', { html: `
          <p>Hola <strong>${student.first_name}</strong>,</p>
          <p>Para iniciar sesión necesitás configurar tu contraseña.</p>
          <p>Tu nombre de usuario es: <strong>${student.username}</strong></p>
          <p>Hacé clic aquí (válido por 24 horas):</p>
          <p><a href="${link}">${link}</a></p>
          `,
            });
            return { status: 'no_password', maskedEmail: this.maskEmail(student.email) };
        }
        return { status: 'has_password' };
    }
    async requestPasswordReset(dto) {
        const student = await this.studentService.findForAuth(dto.username);
        if (!student)
            throw new common_1.NotFoundException('Usuario no encontrado.');
        if (student.account_status === 'suspended') {
            throw new common_1.UnauthorizedException('Tu cuenta está suspendida. Contactá a un administrador.');
        }
        if (!student.password) {
            throw new common_1.BadRequestException('Esta cuenta no tiene contraseña configurada. Revisá tu correo de bienvenida.');
        }
        await this.studentService.sendPasswordResetEmail(student);
    }
    async setPassword(dto) {
        if (dto.password !== dto.confirmPassword) {
            throw new common_1.BadRequestException('Las contraseñas no coinciden.');
        }
        const { studentId } = await this.passwordResetTokenService.consume(dto.token);
        const hashed = await bcrypt.hash(dto.password, 10);
        await this.studentService.setPassword(studentId, hashed);
    }
    async issueCode(loginDto) {
        const clientId = parseInt(loginDto.client_id, 10);
        const client = await this.oauthClientService.findOne(clientId).catch(() => null);
        if (!client)
            throw new common_1.UnauthorizedException('client_id inválido.');
        if (!client.isActive)
            throw new common_1.UnauthorizedException('La aplicación está suspendida.');
        if (!client.redirectUris.includes(loginDto.redirect_uri)) {
            throw new common_1.UnauthorizedException('redirect_uri no coincide con las registradas.');
        }
        const userInfo = await this.validateAndGetUserInfo(loginDto);
        const code = this.codeService.generate(userInfo, clientId);
        return { code, state: loginDto.state };
    }
    async exchangeCodeForTokens(dto) {
        const clientId = parseInt(dto.client_id, 10);
        const valid = await this.oauthClientService.validateClient(clientId, dto.client_secret, dto.redirect_uri);
        if (!valid)
            throw new common_1.UnauthorizedException('client_id, client_secret o redirect_uri inválidos.');
        const entry = this.codeService.consume(dto.code);
        if (!entry)
            throw new common_1.UnauthorizedException('El código es inválido o ya expiró.');
        if (entry.clientId !== clientId)
            throw new common_1.UnauthorizedException('El código no pertenece a este cliente.');
        const [access_token, refresh_token] = await Promise.all([
            this.jwtService.signAsync({ ...entry.userInfo, type: 'access' }, { secret: this.accessSecret, expiresIn: this.accessExpiresIn }),
            this.jwtService.signAsync({ ...entry.userInfo, type: 'refresh', jti: (0, crypto_1.randomUUID)() }, { secret: this.refreshSecret, expiresIn: this.refreshExpiresIn }),
        ]);
        const sessionExpiresAt = new Date(Date.now() + this.sessionMaxDurationMs);
        await this.refreshTokenService.save({
            token: refresh_token,
            sub: entry.userInfo.sub,
            type: 'student',
            expiresIn: this.refreshExpiresIn,
            sessionExpiresAt,
            clientId,
        });
        return { access_token, refresh_token, token_type: 'Bearer', expires_in: this.parseExpiresIn(this.accessExpiresIn) };
    }
    async refreshTokens(refreshRequestDto) {
        let storedPayload;
        try {
            storedPayload = await this.jwtService.verifyAsync(refreshRequestDto.refresh_token, { secret: this.refreshSecret });
        }
        catch (err) {
            const jwtErr = err;
            if (jwtErr?.name === 'TokenExpiredError') {
                throw new common_1.UnauthorizedException('La sesión expiró. Volvé a iniciar sesión.');
            }
            throw new common_1.UnauthorizedException('Refresh token inválido o revocado.');
        }
        if (storedPayload.type !== 'refresh') {
            throw new common_1.UnauthorizedException('El token proporcionado no es un refresh token.');
        }
        const record = await this.refreshTokenService.consume(refreshRequestDto.refresh_token);
        const userInfo = {
            sub: storedPayload.sub,
            nombre: storedPayload.nombre,
            apellido: storedPayload.apellido,
            legajo: storedPayload.legajo,
            carrera: storedPayload.carrera,
            email: storedPayload.email,
            grupo: storedPayload.grupo,
        };
        const inactivityExpiry = new Date(Date.now() + this.parseExpiresIn(this.refreshExpiresIn) * 1000);
        const effectiveExpiry = record.sessionExpiresAt
            ? new Date(Math.min(inactivityExpiry.getTime(), record.sessionExpiresAt.getTime()))
            : inactivityExpiry;
        const newRefreshExpiresInSeconds = Math.floor((effectiveExpiry.getTime() - Date.now()) / 1000);
        const [newAccessToken, newRefreshToken] = await Promise.all([
            this.jwtService.signAsync({ ...userInfo, type: 'access' }, { secret: this.accessSecret, expiresIn: this.accessExpiresIn }),
            this.jwtService.signAsync({ ...userInfo, type: 'refresh', jti: (0, crypto_1.randomUUID)() }, { secret: this.refreshSecret, expiresIn: newRefreshExpiresInSeconds }),
        ]);
        await this.refreshTokenService.save({
            token: newRefreshToken,
            sub: record.sub,
            type: 'student',
            expiresIn: `${newRefreshExpiresInSeconds}s`,
            familyId: record.familyId,
            sessionExpiresAt: record.sessionExpiresAt,
            clientId: record.clientId ?? undefined,
        });
        return { access_token: newAccessToken, refresh_token: newRefreshToken, token_type: 'Bearer', expires_in: this.parseExpiresIn(this.accessExpiresIn) };
    }
    async logout(dto) {
        await this.refreshTokenService.revokeFamily(dto.refresh_token);
    }
    getCleanUserInfo(payload) {
        return {
            sub: payload.sub, nombre: payload.nombre, apellido: payload.apellido,
            legajo: payload.legajo, carrera: payload.carrera, email: payload.email, grupo: payload.grupo,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)('ICodeService')),
    __param(3, (0, common_1.Inject)('IOAuthClientService')),
    __param(4, (0, common_1.Inject)('IRefreshTokenService')),
    __param(5, (0, common_1.Inject)('IStudentService')),
    __param(6, (0, common_1.Inject)('IPasswordResetTokenService')),
    __param(7, (0, common_1.Inject)('IMailService')),
    __metadata("design:paramtypes", [config_1.ConfigService,
        jwt_1.JwtService, Object, Object, Object, Object, Object, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map