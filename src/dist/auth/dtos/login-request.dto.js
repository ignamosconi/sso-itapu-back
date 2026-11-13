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
exports.LoginRequestDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class LoginRequestDto {
    client_id;
    redirect_uri;
    state;
    legajo;
    password;
}
exports.LoginRequestDto = LoginRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1', description: 'ID del cliente OAuth registrado' }),
    (0, class_validator_1.IsNumberString)(),
    __metadata("design:type", String)
], LoginRequestDto.prototype, "client_id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'http://localhost:4000/callback', description: 'URI de redirección registrada para el cliente' }),
    (0, class_validator_1.IsUrl)({ require_tld: false }),
    __metadata("design:type", String)
], LoginRequestDto.prototype, "redirect_uri", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'state-aleatorio-xyz', description: 'Valor generado por la app cliente para prevenir CSRF' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginRequestDto.prototype, "state", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '13692' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginRequestDto.prototype, "legajo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'mi_contraseña_segura123!' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], LoginRequestDto.prototype, "password", void 0);
//# sourceMappingURL=login-request.dto.js.map