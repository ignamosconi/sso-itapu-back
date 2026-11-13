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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const rxjs_1 = require("rxjs");
const crypto_1 = require("crypto");
let AuthService = class AuthService {
    httpService;
    configService;
    jwtService;
    codeService;
    oauthClientService;
    refreshTokenService;
    baseUrl;
    accessSecret;
    refreshSecret;
    accessExpiresIn;
    refreshExpiresIn;
    sessionMaxDurationMs;
    constructor(httpService, configService, jwtService, codeService, oauthClientService, refreshTokenService) {
        this.httpService = httpService;
        this.configService = configService;
        this.jwtService = jwtService;
        this.codeService = codeService;
        this.oauthClientService = oauthClientService;
        this.refreshTokenService = refreshTokenService;
        this.baseUrl = this.configService.getOrThrow('AUTOGESTION_BASE_URL');
        this.accessSecret = this.configService.getOrThrow('JWT_ACCESS_SECRET');
        this.refreshSecret = this.configService.getOrThrow('JWT_REFRESH_SECRET');
        this.accessExpiresIn = this.configService.getOrThrow('JWT_ACCESS_EXPIRES_IN');
        this.refreshExpiresIn = this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN');
        this.sessionMaxDurationMs = this.parseExpiresIn(this.configService.getOrThrow('JWT_REFRESH_SESSION_MAX_DURATION')) * 1000;
    }
    async validateAndGetUserInfo(loginDto) {
        let loginData;
        try {
            const loginResponse = await (0, rxjs_1.firstValueFrom)(this.httpService.post(`${this.baseUrl}/login`, {}, {
                headers: { nick: loginDto.legajo, password: loginDto.password },
                timeout: 8000,
            }));
            loginData = loginResponse.data;
        }
        catch {
            throw new common_1.UnauthorizedException('Credenciales inválidas en Autogestión.');
        }
        if (!loginData || !loginData.hashActual) {
            throw new common_1.UnauthorizedException('No se pudo obtener el hash de sesión.');
        }
        const credentialsString = `${loginDto.legajo}:${loginData.hashActual}`;
        const base64Credentials = Buffer.from(credentialsString).toString('base64');
        let userData;
        try {
            const userResponse = await (0, rxjs_1.firstValueFrom)(this.httpService.get(`${this.baseUrl}/usuarios`, {
                headers: { Authorization: `Basic ${base64Credentials}` },
                timeout: 8000,
            }));
            userData = userResponse.data;
        }
        catch {
            throw new common_1.BadRequestException('Error al recuperar los datos del estudiante.');
        }
        const email = userData.persona?.email && userData.persona.email.trim().toLowerCase() !== 'none'
            ? userData.persona.email.trim()
            : '';
        return {
            sub: userData.id.toString(),
            nombre: userData.persona.nombre,
            apellido: userData.persona.apellido,
            legajo: userData.persona.alumno?.legajo || userData.nick,
            carrera: userData.persona.alumno?.especialidad?.nombre || 'No especificada',
            email,
            grupo: userData.grupo?.nombre || 'Alumno',
        };
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
        return {
            access_token,
            refresh_token,
            token_type: 'Bearer',
            expires_in: this.parseExpiresIn(this.accessExpiresIn),
        };
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
    getCleanUserInfo(payload) {
        return {
            sub: payload.sub,
            nombre: payload.nombre,
            apellido: payload.apellido,
            legajo: payload.legajo,
            carrera: payload.carrera,
            email: payload.email,
            grupo: payload.grupo,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)('ICodeService')),
    __param(4, (0, common_1.Inject)('IOAuthClientService')),
    __param(5, (0, common_1.Inject)('IRefreshTokenService')),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService,
        jwt_1.JwtService, Object, Object, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map