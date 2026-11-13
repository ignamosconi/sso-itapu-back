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
exports.Admin2faSetupResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class Admin2faSetupResponseDto {
    qrCodeDataUrl;
    manualEntrySecret;
    confirm_pending_token;
}
exports.Admin2faSetupResponseDto = Admin2faSetupResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'URL de datos del QR para escanear con el autenticador' }),
    __metadata("design:type", String)
], Admin2faSetupResponseDto.prototype, "qrCodeDataUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Secret en texto plano, para ingreso manual en el autenticador' }),
    __metadata("design:type", String)
], Admin2faSetupResponseDto.prototype, "manualEntrySecret", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Nuevo pending token con purpose 2fa-confirm. ' +
            'Usarlo en /2fa/confirm para activar el 2FA. ' +
            'El pending token original (usado en /2fa/setup) ya fue consumido y no puede reutilizarse.',
    }),
    __metadata("design:type", String)
], Admin2faSetupResponseDto.prototype, "confirm_pending_token", void 0);
//# sourceMappingURL=admin-2fa-setup-response.dto.js.map