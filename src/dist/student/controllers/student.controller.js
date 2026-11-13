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
exports.StudentController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const create_student_dto_js_1 = require("../dtos/create-student.dto.js");
const update_student_dto_js_1 = require("../dtos/update-student.dto.js");
const delete_student_dto_js_1 = require("../dtos/delete-student.dto.js");
const student_response_dto_js_1 = require("../dtos/student-response.dto.js");
const student_filters_dto_js_1 = require("../dtos/student-filters.dto.js");
const import_preview_result_dto_js_1 = require("../dtos/import-preview-result.dto.js");
const import_confirm_dto_js_1 = require("../dtos/import-confirm.dto.js");
const admin_jwt_guard_js_1 = require("../../auth/guards/admin-jwt.guard.js");
let StudentController = class StudentController {
    service;
    constructor(service) {
        this.service = service;
    }
    findAll(filters) {
        return this.service.findAll(filters);
    }
    findOne(id) {
        return this.service.findOne(id);
    }
    create(dto) {
        return this.service.create(dto);
    }
    update(id, dto) {
        return this.service.update(id, dto);
    }
    remove(id, dto) {
        return this.service.remove(id, dto);
    }
    suspend(id) {
        return this.service.suspend(id);
    }
    activate(id) {
        return this.service.activate(id);
    }
    resendWelcome(id) {
        return this.service.resendWelcome(id);
    }
    downloadExample(res) {
        const csv = this.service.generateExampleCsv();
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="ejemplo-carga-masiva.csv"');
        res.send(csv);
    }
    importPreview(file) {
        if (!file)
            throw new common_1.BadRequestException('No se recibió ningún archivo.');
        return this.service.parseImportPreview(file.buffer);
    }
    importConfirm(dto) {
        return this.service.confirmImport(dto);
    }
};
exports.StudentController = StudentController;
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Listar usuarios con filtros y paginación' }),
    (0, swagger_1.ApiResponse)({ status: 200 }),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [student_filters_dto_js_1.StudentFiltersDto]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "findAll", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Obtener usuario por ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: student_response_dto_js_1.StudentResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'No encontrado' }),
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "findOne", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Registrar un usuario individualmente' }),
    (0, swagger_1.ApiResponse)({ status: 201, type: student_response_dto_js_1.StudentResponseDto }),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_student_dto_js_1.CreateStudentDto]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "create", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Actualizar datos de un usuario',
        description: 'No permite modificar email ni contraseña.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, type: student_response_dto_js_1.StudentResponseDto }),
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_student_dto_js_1.UpdateStudentDto]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "update", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Dar de baja a un usuario',
        description: 'Si el usuario tiene contraseña, se requiere ingresarla para confirmar la baja. ' +
            'El alumno debe estar presente al momento de la baja.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Usuario dado de baja' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Contraseña incorrecta' }),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, delete_student_dto_js_1.DeleteStudentDto]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "remove", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Suspender cuenta de usuario' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: student_response_dto_js_1.StudentResponseDto }),
    (0, common_1.Patch)(':id/suspend'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "suspend", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Reactivar cuenta de usuario' }),
    (0, swagger_1.ApiResponse)({ status: 200, type: student_response_dto_js_1.StudentResponseDto }),
    (0, common_1.Patch)(':id/activate'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "activate", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Reenviar email de bienvenida',
        description: 'Solo disponible para cuentas en estado pending_registration. ' +
            'Genera un nuevo token de setup y reenvía el email con el link de configuración de contraseña.',
    }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'Email reenviado' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'La cuenta no está en estado pending_registration' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Alumno no encontrado' }),
    (0, common_1.HttpCode)(204),
    (0, common_1.Post)(':id/resend-welcome'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "resendWelcome", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Descargar CSV de ejemplo para carga masiva' }),
    (0, common_1.Get)('import/example'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], StudentController.prototype, "downloadExample", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Previsualizar importación CSV antes de confirmar' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiBody)({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } }),
    (0, swagger_1.ApiResponse)({ status: 200, type: import_preview_result_dto_js_1.ImportPreviewResultDto }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    (0, common_1.Post)('import/preview'),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "importPreview", null);
__decorate([
    (0, swagger_1.ApiOperation)({ summary: 'Confirmar importación de filas válidas previamente parseadas' }),
    (0, swagger_1.ApiResponse)({ status: 201, type: import_confirm_dto_js_1.ImportConfirmResultDto }),
    (0, common_1.Post)('import/confirm'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [import_confirm_dto_js_1.ImportConfirmDto]),
    __metadata("design:returntype", Promise)
], StudentController.prototype, "importConfirm", null);
exports.StudentController = StudentController = __decorate([
    (0, swagger_1.ApiTags)('Admin — Padrón de usuarios'),
    (0, swagger_1.ApiBearerAuth)('admin-jwt'),
    (0, common_1.UseGuards)(admin_jwt_guard_js_1.AdminJwtGuard),
    (0, common_1.Controller)('admin/students'),
    __param(0, (0, common_1.Inject)('IStudentService')),
    __metadata("design:paramtypes", [Object])
], StudentController);
//# sourceMappingURL=student.controller.js.map