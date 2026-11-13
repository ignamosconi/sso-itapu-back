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
exports.OAuthClientCreatedResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class OAuthClientCreatedResponseDto {
    id;
    clientName;
    redirectUris;
    plainSecret;
    createdAt;
    updatedAt;
}
exports.OAuthClientCreatedResponseDto = OAuthClientCreatedResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1 }),
    __metadata("design:type", Number)
], OAuthClientCreatedResponseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Torneito' }),
    __metadata("design:type", String)
], OAuthClientCreatedResponseDto.prototype, "clientName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['http://localhost:4000/callback', 'https://miapp.com/callback'] }),
    __metadata("design:type", Array)
], OAuthClientCreatedResponseDto.prototype, "redirectUris", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '57df647b26106facbd7bf95bb728dcb62a332123a080cd8b649596e92dfeb089',
        description: 'Secret en texto plano. Solo visible en este momento (no se puede recuperar después).',
    }),
    __metadata("design:type", String)
], OAuthClientCreatedResponseDto.prototype, "plainSecret", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], OAuthClientCreatedResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], OAuthClientCreatedResponseDto.prototype, "updatedAt", void 0);
//# sourceMappingURL=oauth-client-created-response.dto.js.map