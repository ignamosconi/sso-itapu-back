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
exports.AdminAuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_jwt_guard_js_1 = require("../../auth/guards/admin-jwt.guard.js");
const admin_2fa_reset_dto_js_1 = require("../dtos/admin-2fa-reset.dto.js");
const throttler_1 = require("@nestjs/throttler");
const swagger_2 = require("@nestjs/swagger");
const admin_login_request_dto_js_1 = require("../dtos/admin-login-request.dto.js");
const admin_login_response_dto_js_1 = require("../dtos/admin-login-response.dto.js");
const admin_2fa_setup_request_dto_js_1 = require("../dtos/admin-2fa-setup-request.dto.js");
const admin_2fa_setup_response_dto_js_1 = require("../dtos/admin-2fa-setup-response.dto.js");
const admin_2fa_confirm_dto_js_1 = require("../dtos/admin-2fa-confirm.dto.js");
const admin_2fa_validate_dto_js_1 = require("../dtos/admin-2fa-validate.dto.js");
const admin_refresh_request_dto_js_1 = require("../dtos/admin-refresh-request.dto.js");
const admin_logout_request_dto_js_1 = require("../dtos/admin-logout-request.dto.js");
const token_response_dto_js_1 = require("../../auth/dtos/token-response.dto.js");
let AdminAuthController = class AdminAuthController {
    adminAuthService;
    constructor(adminAuthService) {
        this.adminAuthService = adminAuthService;
    }
    login(dto) {
        return this.adminAuthService.login(dto);
    }
    setup2fa(dto) {
        return this.adminAuthService.setup2fa(dto);
    }
    confirm2fa(dto) {
        return this.adminAuthService.confirm2fa(dto);
    }
    validate2fa(dto) {
        return this.adminAuthService.validate2fa(dto);
    }
    reset2fa(req, dto) {
        return this.adminAuthService.reset2fa(req.admin.sub, dto);
    }
    refresh(dto) {
        return this.adminAuthService.refresh(dto);
    }
    logout(dto) {
        return this.adminAuthService.logout(dto);
    }
};
exports.AdminAuthController = AdminAuthController;
__decorate([
    (0, swagger_2.ApiOperation)({
        summary: 'Login de administrador (paso 1)',
        description: 'Valida credenciales y devuelve un pending_token. Si requires_2fa_setup es true, ir a /2fa/setup. Si es false, ir a /2fa/validate.',
    }),
    (0, swagger_2.ApiResponse)({ status: 201, type: admin_login_response_dto_js_1.AdminLoginResponseDto }),
    (0, swagger_2.ApiResponse)({ status: 401, description: 'Credenciales inválidas' }),
    (0, throttler_1.Throttle)({ default: { ttl: 60000, limit: 5 } }),
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_login_request_dto_js_1.AdminLoginRequestDto]),
    __metadata("design:returntype", Promise)
], AdminAuthController.prototype, "login", null);
__decorate([
    (0, swagger_2.ApiOperation)({
        summary: 'Configurar 2FA (paso 2a — solo primera vez)',
        description: 'Genera un secret TOTP y devuelve el QR para escanear con el autenticador. Requiere pending_token del login.',
    }),
    (0, swagger_2.ApiResponse)({ status: 201, type: admin_2fa_setup_response_dto_js_1.Admin2faSetupResponseDto }),
    (0, swagger_2.ApiResponse)({ status: 401, description: 'pending_token inválido o expirado' }),
    (0, throttler_1.Throttle)({ default: { ttl: 900000, limit: 5 } }),
    (0, common_1.Post)('2fa/setup'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_2fa_setup_request_dto_js_1.Admin2faSetupRequestDto]),
    __metadata("design:returntype", Promise)
], AdminAuthController.prototype, "setup2fa", null);
__decorate([
    (0, swagger_2.ApiOperation)({
        summary: 'Confirmar configuración 2FA y obtener tokens (paso 3a — solo primera vez)',
        description: 'Valida el primer código TOTP, activa el 2FA en la cuenta y emite access_token + refresh_token reales.',
    }),
    (0, swagger_2.ApiResponse)({ status: 201, type: token_response_dto_js_1.TokenResponseDto }),
    (0, swagger_2.ApiResponse)({ status: 401, description: 'Código 2FA inválido o pending_token expirado' }),
    (0, throttler_1.Throttle)({ default: { ttl: 900000, limit: 5 } }),
    (0, common_1.Post)('2fa/confirm'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_2fa_confirm_dto_js_1.Admin2faConfirmDto]),
    __metadata("design:returntype", Promise)
], AdminAuthController.prototype, "confirm2fa", null);
__decorate([
    (0, swagger_2.ApiOperation)({
        summary: 'Validar código 2FA y obtener tokens (paso 2b — logins posteriores)',
        description: 'Para admins que ya tienen 2FA activo. Valida el código TOTP y emite access_token + refresh_token reales.',
    }),
    (0, swagger_2.ApiResponse)({ status: 201, type: token_response_dto_js_1.TokenResponseDto }),
    (0, swagger_2.ApiResponse)({ status: 401, description: 'Código 2FA inválido o pending_token expirado' }),
    (0, throttler_1.Throttle)({ default: { ttl: 900000, limit: 5 } }),
    (0, common_1.Post)('2fa/validate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_2fa_validate_dto_js_1.Admin2faValidateDto]),
    __metadata("design:returntype", Promise)
], AdminAuthController.prototype, "validate2fa", null);
__decorate([
    (0, swagger_2.ApiOperation)({
        summary: 'Resetear 2FA',
        description: 'Invalida el secret TOTP actual del admin. El próximo login requerirá configurar 2FA de nuevo. Requiere confirmar la password actual.',
    }),
    (0, swagger_2.ApiResponse)({ status: 204, description: '2FA reseteado correctamente' }),
    (0, swagger_2.ApiResponse)({ status: 401, description: 'Password incorrecta o token inválido' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.HttpCode)(204),
    (0, common_1.Post)('2fa/reset'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, admin_2fa_reset_dto_js_1.Admin2faResetDto]),
    __metadata("design:returntype", Promise)
], AdminAuthController.prototype, "reset2fa", null);
__decorate([
    (0, swagger_2.ApiOperation)({ summary: 'Renovar access token de administrador' }),
    (0, swagger_2.ApiResponse)({ status: 201, type: token_response_dto_js_1.TokenResponseDto }),
    (0, swagger_2.ApiResponse)({ status: 401, description: 'Refresh token inválido o expirado' }),
    (0, common_1.Post)('refresh'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_refresh_request_dto_js_1.AdminRefreshRequestDto]),
    __metadata("design:returntype", Promise)
], AdminAuthController.prototype, "refresh", null);
__decorate([
    (0, swagger_2.ApiOperation)({ summary: 'Cerrar sesión de administrador' }),
    (0, swagger_2.ApiResponse)({ status: 204, description: 'Sesión cerrada correctamente' }),
    (0, common_1.HttpCode)(204),
    (0, common_1.Post)('logout'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_logout_request_dto_js_1.AdminLogoutRequestDto]),
    __metadata("design:returntype", Promise)
], AdminAuthController.prototype, "logout", null);
exports.AdminAuthController = AdminAuthController = __decorate([
    (0, swagger_2.ApiTags)('Admin — Autenticación'),
    (0, common_1.Controller)('admin/auth'),
    __param(0, (0, common_1.Inject)('IAdminAuthService')),
    __metadata("design:paramtypes", [Object])
], AdminAuthController);
//# sourceMappingURL=admin-auth.controller.js.map