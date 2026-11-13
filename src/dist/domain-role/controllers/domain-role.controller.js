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
exports.DomainRoleController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const create_domain_role_dto_js_1 = require("../dtos/create-domain-role.dto.js");
const domain_role_response_dto_js_1 = require("../dtos/domain-role-response.dto.js");
const admin_jwt_guard_js_1 = require("../../auth/guards/admin-jwt.guard.js");
let DomainRoleController = class DomainRoleController {
    service;
    constructor(service) {
        this.service = service;
    }
    findAll() { return this.service.findAll(); }
    findOne(id) {
        return this.service.findOne(id);
    }
    create(dto) {
        return this.service.create(dto);
    }
    remove(id) {
        return this.service.remove(id);
    }
};
exports.DomainRoleController = DomainRoleController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Listar todos los roles institucionales' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [domain_role_response_dto_js_1.DomainRoleResponseDto] }),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DomainRoleController.prototype, "findAll", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Obtener un rol por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: domain_role_response_dto_js_1.DomainRoleResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Rol no encontrado' }),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], DomainRoleController.prototype, "findOne", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Crear un nuevo rol institucional' }),
    (0, swagger_1.ApiResponse)({ status: 201, type: domain_role_response_dto_js_1.DomainRoleResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'El rol ya existe' }),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_domain_role_dto_js_1.CreateDomainRoleDto]),
    __metadata("design:returntype", Promise)
], DomainRoleController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Eliminar un rol institucional',
        description: 'No se puede eliminar si hay usuarios asignados a este rol.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Rol eliminado' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Hay usuarios con este rol' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Rol no encontrado' }),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], DomainRoleController.prototype, "remove", null);
exports.DomainRoleController = DomainRoleController = __decorate([
    (0, swagger_1.ApiTags)('Admin — Roles institucionales'),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Controller)('admin/domain-roles'),
    __param(0, (0, common_1.Inject)('IDomainRoleService')),
    __metadata("design:paramtypes", [Object])
], DomainRoleController);
//# sourceMappingURL=domain-role.controller.js.map