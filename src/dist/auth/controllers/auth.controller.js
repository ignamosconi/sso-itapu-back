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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const path_1 = require("path");
const login_request_dto_js_1 = require("../dtos/login-request.dto.js");
const authorization_code_request_dto_js_1 = require("../dtos/authorization-code-request.dto.js");
const refresh_request_dto_js_1 = require("../dtos/refresh-request.dto.js");
const logout_request_dto_js_1 = require("../dtos/logout-request.dto.js");
const code_response_dto_js_1 = require("../dtos/code-response.dto.js");
const token_response_dto_js_1 = require("../dtos/token-response.dto.js");
const user_info_oauth_dto_js_1 = require("../dtos/user-info-oauth.dto.js");
const jwt_guard_js_1 = require("../guards/jwt.guard.js");
const current_user_decorator_js_1 = require("../decorators/current-user.decorator.js");
const jwt_payload_dto_js_1 = require("../dtos/jwt-payload.dto.js");
const swagger_1 = require("@nestjs/swagger");
const check_username_request_dto_js_1 = require("../dtos/check-username-request.dto.js");
const check_username_response_dto_js_1 = require("../dtos/check-username-response.dto.js");
const set_password_request_dto_js_1 = require("../dtos/set-password-request.dto.js");
const request_password_reset_request_dto_js_1 = require("../dtos/request-password-reset-request.dto.js");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    serveLoginPage(res) {
        res.sendFile((0, path_1.join)(__dirname, '..', '..', 'public', 'login', 'index.html'));
    }
    async login(loginDto) {
        return this.authService.issueCode(loginDto);
    }
    async token(dto) {
        return this.authService.exchangeCodeForTokens(dto);
    }
    async refresh(refreshRequestDto) {
        return this.authService.refreshTokens(refreshRequestDto);
    }
    async logout(dto) {
        return this.authService.logout(dto);
    }
    me(user) {
        return this.authService.getCleanUserInfo(user);
    }
    async checkUsername(dto) {
        return this.authService.checkUsername(dto);
    }
    async requestPasswordReset(dto) {
        return this.authService.requestPasswordReset(dto);
    }
    async setPassword(dto) {
        return this.authService.setPassword(dto);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, swagger_1.ApiExcludeEndpoint)(),
    (0, common_1.Get)('login'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "serveLoginPage", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Login de alumno',
        description: 'Valida las credenciales del alumno contra autogestión y emite un authorization code de un solo uso (TTL definido por CODE_TTL_MS). Este endpoint es llamado por el HTML del popup.',
    }),
    (0, swagger_1.ApiResponse)({ status: 201, type: code_response_dto_js_1.CodeResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Credenciales inválidas o client_id/redirect_uri incorrectos' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Body malformado' }),
    (0, throttler_1.Throttle)({ default: { ttl: 60000, limit: 5 } }),
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_request_dto_js_1.LoginRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Canjear authorization code por tokens',
        description: 'Endpoint server-to-server. Recibe el code emitido por /login junto con client_id, client_secret y redirect_uri. Devuelve access_token y refresh_token. El code es de un solo uso y se invalida inmediatamente.',
    }),
    (0, swagger_1.ApiResponse)({ status: 201, type: token_response_dto_js_1.TokenResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Code inválido, expirado, o credenciales de cliente incorrectas' }),
    (0, throttler_1.Throttle)({ default: { ttl: 60000, limit: 10 } }),
    (0, common_1.Post)('token'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [authorization_code_request_dto_js_1.AuthorizationCodeRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "token", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Renovar access token',
        description: 'Recibe un refresh token válido y devuelve un nuevo access token. El refresh token no cambia.',
    }),
    (0, swagger_1.ApiResponse)({ status: 201, type: token_response_dto_js_1.TokenResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Refresh token inválido o expirado' }),
    (0, common_1.Post)('refresh'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_request_dto_js_1.RefreshRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Cerrar sesión de alumno',
        description: 'Revoca el refresh token y toda su familia. El access token expira naturalmente (máx. 15m).',
    }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Sesión cerrada correctamente' }),
    (0, common_1.HttpCode)(204),
    (0, common_1.Post)('logout'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [logout_request_dto_js_1.LogoutRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Obtener datos del alumno autenticado',
        description: 'Devuelve los datos del alumno a partir del access token. Requiere Bearer token de alumno.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, type: user_info_oauth_dto_js_1.UserInfoOauthDto }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Token inválido, expirado o ausente' }),
    (0, swagger_1.ApiBearerAuth)('alumno-jwt'),
    (0, common_1.UseGuards)(jwt_guard_js_1.JwtGuard),
    (0, common_1.Get)('me'),
    __param(0, (0, current_user_decorator_js_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [jwt_payload_dto_js_1.JwtPayloadDto]),
    __metadata("design:returntype", user_info_oauth_dto_js_1.UserInfoOauthDto)
], AuthController.prototype, "me", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Verificar si un usuario tiene contraseña configurada',
        description: 'Si el usuario no tiene contraseña (pending_registration), envía automáticamente ' +
            'un email de setup y devuelve el email censurado. No revela si el usuario existe o no ' +
            'con el mismo mensaje en caso de suspensión.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, type: check_username_response_dto_js_1.CheckUsernameResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Usuario no encontrado' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Cuenta suspendida' }),
    (0, throttler_1.Throttle)({ default: { ttl: 60000, limit: 5 } }),
    (0, common_1.Post)('check-username'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [check_username_request_dto_js_1.CheckUsernameRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "checkUsername", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Solicitar email de recuperación de contraseña',
        description: 'Envía un link de un solo uso (24hs) al email registrado del usuario.',
    }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Email enviado' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Usuario no encontrado' }),
    (0, throttler_1.Throttle)({ default: { ttl: 900000, limit: 3 } }),
    (0, common_1.HttpCode)(204),
    (0, common_1.Post)('request-password-reset'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [request_password_reset_request_dto_js_1.RequestPasswordResetRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestPasswordReset", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Establecer o restablecer contraseña mediante token',
        description: 'Consume el token de un solo uso y actualiza la contraseña. Activa la cuenta si estaba en pending_registration.',
    }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Contraseña actualizada' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Las contraseñas no coinciden, o token inválido/expirado/usado' }),
    (0, throttler_1.Throttle)({ default: { ttl: 60000, limit: 5 } }),
    (0, common_1.HttpCode)(204),
    (0, common_1.Post)('set-password'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [set_password_request_dto_js_1.SetPasswordRequestDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "setPassword", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('SSO — Alumnos'),
    (0, common_1.Controller)(process.env.AUTH_ROUTE_PATH || 'oauth'),
    __param(0, (0, common_1.Inject)('IAuthService')),
    __metadata("design:paramtypes", [Object])
], AuthController);
//# sourceMappingURL=auth.controller.js.map