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
exports.CreateOAuthClientDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreateOAuthClientDto {
    clientName;
    redirectUris;
}
exports.CreateOAuthClientDto = CreateOAuthClientDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Torneito', minLength: 2 }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    __metadata("design:type", String)
], CreateOAuthClientDto.prototype, "clientName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: ['http://localhost:4000/callback', 'https://miapp.com/callback'],
        description: 'Mínimo 1, máximo 5 URIs. Podés incluir URLs de desarrollo (localhost) y producción.',
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(5),
    (0, class_validator_1.IsUrl)({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }, { each: true }),
    __metadata("design:type", Array)
], CreateOAuthClientDto.prototype, "redirectUris", void 0);
//# sourceMappingURL=create-oauth-client.dto.js.map