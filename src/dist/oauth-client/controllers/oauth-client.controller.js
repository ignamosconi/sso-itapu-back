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
exports.OAuthClientController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const create_oauth_client_dto_js_1 = require("../dtos/create-oauth-client.dto.js");
const update_oauth_client_dto_js_1 = require("../dtos/update-oauth-client.dto.js");
const oauth_client_response_dto_js_1 = require("../dtos/oauth-client-response.dto.js");
const oauth_client_created_response_dto_js_1 = require("../dtos/oauth-client-created-response.dto.js");
const oauth_client_info_dto_js_1 = require("../dtos/oauth-client-info.dto.js");
const send_credentials_email_dto_js_1 = require("../dtos/send-credentials-email.dto.js");
const admin_jwt_guard_js_1 = require("../../auth/guards/admin-jwt.guard.js");
let OAuthClientController = class OAuthClientController {
    oauthClientService;
    constructor(oauthClientService) {
        this.oauthClientService = oauthClientService;
    }
    findAll() {
        return this.oauthClientService.findAll();
    }
    findOne(id) {
        return this.oauthClientService.findOne(id);
    }
    findInfo(id) {
        return this.oauthClientService.findInfo(id);
    }
    create(dto) {
        return this.oauthClientService.create(dto);
    }
    update(id, dto) {
        return this.oauthClientService.update(id, dto);
    }
    remove(id) {
        return this.oauthClientService.remove(id);
    }
    regenerateSecret(id) {
        return this.oauthClientService.regenerateSecret(id);
    }
    sendCredentialsByEmail(id, dto) {
        return this.oauthClientService.sendCredentialsByEmail(id, dto.to);
    }
    suspend(id) {
        return this.oauthClientService.suspend(id);
    }
    activate(id) {
        return this.oauthClientService.activate(id);
    }
};
exports.OAuthClientController = OAuthClientController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Listar todos los clientes OAuth' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [oauth_client_response_dto_js_1.OAuthClientResponseDto] }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "findAll", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Obtener cliente OAuth por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: oauth_client_response_dto_js_1.OAuthClientResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "findOne", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Obtener nombre público del cliente OAuth',
        description: 'Endpoint público. Usado por el HTML del popup para mostrar el nombre de la app.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, type: oauth_client_info_dto_js_1.OAuthClientInfoDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado' }),
    (0, common_1.Get)(':id/info'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "findInfo", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Crear nuevo cliente OAuth' }),
    (0, swagger_1.ApiResponse)({ status: 201, type: oauth_client_created_response_dto_js_1.OAuthClientCreatedResponseDto, description: 'El plainSecret solo es visible en esta respuesta.' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_oauth_client_dto_js_1.CreateOAuthClientDto]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar cliente OAuth' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: oauth_client_response_dto_js_1.OAuthClientResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_oauth_client_dto_js_1.UpdateOAuthClientDto]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "update", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Eliminar cliente OAuth' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cliente eliminado' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "remove", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Regenerar client secret' }),
    (0, swagger_1.ApiResponse)({ status: 201, type: oauth_client_created_response_dto_js_1.OAuthClientCreatedResponseDto, description: 'El plainSecret solo es visible en esta respuesta.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Post)(':id/regenerate-secret'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "regenerateSecret", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Enviar credenciales por email' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Email enviado' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Error al enviar el email' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Post)(':id/send-credentials'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, send_credentials_email_dto_js_1.SendCredentialsEmailDto]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "sendCredentialsByEmail", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Suspender cliente OAuth', description: 'El cliente no podrá autenticar usuarios hasta que sea reactivado.' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: oauth_client_response_dto_js_1.OAuthClientResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Patch)(':id/suspend'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "suspend", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Activar cliente OAuth suspendido' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: oauth_client_response_dto_js_1.OAuthClientResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado' }),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Patch)(':id/activate'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], OAuthClientController.prototype, "activate", null);
exports.OAuthClientController = OAuthClientController = __decorate([
    (0, swagger_1.ApiTags)('Admin — Clientes OAuth'),
    (0, common_1.Controller)('admin/clients'),
    __param(0, (0, common_1.Inject)('IOAuthClientService')),
    __metadata("design:paramtypes", [Object])
], OAuthClientController);
//# sourceMappingURL=oauth-client.controller.js.map