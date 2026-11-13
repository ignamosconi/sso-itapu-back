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
exports.OAuthClientResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class OAuthClientResponseDto {
    id;
    clientName;
    redirectUris;
    isActive;
    createdAt;
    updatedAt;
}
exports.OAuthClientResponseDto = OAuthClientResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1 }),
    __metadata("design:type", Number)
], OAuthClientResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Torneito' }),
    __metadata("design:type", String)
], OAuthClientResponseDto.prototype, "clientName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['http://localhost:4000/callback', 'https://miapp.com/callback'] }),
    __metadata("design:type", Array)
], OAuthClientResponseDto.prototype, "redirectUris", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: 'false = cliente suspendido, no puede autenticar usuarios' }),
    __metadata("design:type", Boolean)
], OAuthClientResponseDto.prototype, "isActive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], OAuthClientResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], OAuthClientResponseDto.prototype, "updatedAt", void 0);
//# sourceMappingURL=oauth-client-response.dto.js.map