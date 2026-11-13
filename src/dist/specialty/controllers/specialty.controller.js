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
exports.SpecialtyController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const create_specialty_dto_js_1 = require("../dtos/create-specialty.dto.js");
const specialty_response_dto_js_1 = require("../dtos/specialty-response.dto.js");
const admin_jwt_guard_js_1 = require("../../auth/guards/admin-jwt.guard.js");
let SpecialtyController = class SpecialtyController {
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
exports.SpecialtyController = SpecialtyController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Listar todas las especialidades' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: [specialty_response_dto_js_1.SpecialtyResponseDto] }),
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SpecialtyController.prototype, "findAll", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Obtener una especialidad por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: specialty_response_dto_js_1.SpecialtyResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Especialidad no encontrada' }),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], SpecialtyController.prototype, "findOne", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Crear una nueva especialidad' }),
    (0, swagger_1.ApiResponse)({ status: 201, type: specialty_response_dto_js_1.SpecialtyResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'La especialidad ya existe' }),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_specialty_dto_js_1.CreateSpecialtyDto]),
    __metadata("design:returntype", Promise)
], SpecialtyController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Eliminar una especialidad',
        description: 'No se puede eliminar si hay usuarios asignados a esta especialidad.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Especialidad eliminada' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Hay usuarios con esta especialidad' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Especialidad no encontrada' }),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], SpecialtyController.prototype, "remove", null);
exports.SpecialtyController = SpecialtyController = __decorate([
    (0, swagger_1.ApiTags)('Admin — Especialidades'),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Controller)('admin/specialties'),
    __param(0, (0, common_1.Inject)('ISpecialtyService')),
    __metadata("design:paramtypes", [Object])
], SpecialtyController);
//# sourceMappingURL=specialty.controller.js.map