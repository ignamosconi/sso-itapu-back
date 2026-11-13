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
exports.DeleteSelfAdminDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class DeleteSelfAdminDto {
    password;
    confirmationPhrase;
}
exports.DeleteSelfAdminDto = DeleteSelfAdminDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '••••••••',
        description: 'Contraseña actual del administrador.',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(8),
    __metadata("design:type", String)
], DeleteSelfAdminDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'borrar-mi-cuenta-no-es-reversible',
        description: 'Frase de confirmación. Debe ser exactamente: borrar-mi-cuenta-no-es-reversible',
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Equals)('borrar-mi-cuenta-no-es-reversible', {
        message: 'La frase de confirmación no es correcta.',
    }),
    __metadata("design:type", String)
], DeleteSelfAdminDto.prototype, "confirmationPhrase", void 0);
//# sourceMappingURL=delete-self-admin.dto.js.map