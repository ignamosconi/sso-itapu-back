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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const create_admin_dto_js_1 = require("../dtos/create-admin.dto.js");
const delete_self_admin_dto_js_1 = require("../dtos/delete-self-admin.dto.js");
const update_admin_dto_js_1 = require("../dtos/update-admin.dto.js");
const admin_response_dto_js_1 = require("../dtos/admin-response.dto.js");
const admin_jwt_guard_js_1 = require("../../auth/guards/admin-jwt.guard.js");
let AdminController = class AdminController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    findAll() {
        return this.adminService.findAll();
    }
    findOne(id) {
        return this.adminService.findOne(id);
    }
    create(dto) {
        return this.adminService.create(dto);
    }
    updateSelf(dto, req) {
        return this.adminService.updateSelf(req.admin.sub, dto);
    }
    removeSelf(dto, req) {
        return this.adminService.removeSelf(req.admin.sub, dto);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Listar todos los administradores' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [admin_response_dto_js_1.AdminResponseDto] }),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "findAll", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Obtener administrador por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: admin_response_dto_js_1.AdminResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Admin no encontrado' }),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "findOne", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Crear nuevo administrador' }),
    (0, swagger_1.ApiResponse)({ status: 201, type: admin_response_dto_js_1.AdminResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Username ya en uso' }),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_admin_dto_js_1.CreateAdminDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Actualizar propio usuario',
        description: 'Un admin solo puede editar su propio usuario y contraseña.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, type: admin_response_dto_js_1.AdminResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Admin no encontrado' }),
    (0, common_1.Patch)('me'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_admin_dto_js_1.UpdateAdminDto, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateSelf", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Eliminar propia cuenta',
        description: 'Un admin solo puede eliminar su propia cuenta. Requiere contraseña actual y frase de confirmación. No está permitido si es el último admin del sistema.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Cuenta eliminada correctamente.' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Último admin — no se puede eliminar.' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Contraseña incorrecta.' }),
    (0, common_1.Delete)('me'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [delete_self_admin_dto_js_1.DeleteSelfAdminDto, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "removeSelf", null);
exports.AdminController = AdminController = __decorate([
    (0, swagger_1.ApiTags)('Admin — Gestión de administradores'),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Controller)('admin/admins'),
    __param(0, (0, common_1.Inject)('IAdminService')),
    __metadata("design:paramtypes", [Object])
], AdminController);
//# sourceMappingURL=admin.controller.js.map