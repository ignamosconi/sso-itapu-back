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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportPreviewResultDto = exports.ImportPreviewRowDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ImportPreviewRowDto {
    rowNumber;
    valid;
    errors;
    data;
}
exports.ImportPreviewRowDto = ImportPreviewRowDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ImportPreviewRowDto.prototype, "rowNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], ImportPreviewRowDto.prototype, "valid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ required: false }),
    __metadata("design:type", Array)
], ImportPreviewRowDto.prototype, "errors", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Object)
], ImportPreviewRowDto.prototype, "data", void 0);
class ImportPreviewResultDto {
    total;
    valid;
    invalid;
    rows;
}
exports.ImportPreviewResultDto = ImportPreviewResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ImportPreviewResultDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ImportPreviewResultDto.prototype, "valid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ImportPreviewResultDto.prototype, "invalid", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [ImportPreviewRowDto] }),
    __metadata("design:type", Array)
], ImportPreviewResultDto.prototype, "rows", void 0);
//# sourceMappingURL=import-preview-result.dto.js.map