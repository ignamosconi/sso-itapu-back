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
exports.CredentialTokenController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const path_1 = require("path");
const credential_data_response_dto_js_1 = require("../dtos/credential-data-response.dto.js");
let CredentialTokenController = class CredentialTokenController {
    credentialTokenService;
    constructor(credentialTokenService) {
        this.credentialTokenService = credentialTokenService;
    }
    serveCredentialsPage(_token, res) {
        res.sendFile((0, path_1.join)(__dirname, '..', '..', 'public', 'credentials', 'index.html'));
    }
    async consumeCredentialData(token) {
        const result = await this.credentialTokenService.consume(token);
        return {
            id: result.oauthClientId,
            clientName: result.clientName,
            redirectUris: result.redirectUris,
            plainSecret: result.plainSecret,
        };
    }
};
exports.CredentialTokenController = CredentialTokenController;
__decorate([
    (0, swagger_1.ApiExcludeEndpoint)(),
    (0, common_1.Get)(':token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CredentialTokenController.prototype, "serveCredentialsPage", null);
__decorate([
    (0, swagger_1.ApiOperation)({
        summary: 'Consumir credenciales por token de un solo uso',
        description: 'Consume el token atómicamente y devuelve las credenciales. ' +
            'Usa POST para evitar que servicios de preview de email quemen el token con un GET automático.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, type: credential_data_response_dto_js_1.CredentialDataResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Token no encontrado' }),
    (0, swagger_1.ApiResponse)({ status: 410, description: 'Token ya usado o expirado' }),
    (0, common_1.HttpCode)(200),
    (0, common_1.Post)(':token/consume'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CredentialTokenController.prototype, "consumeCredentialData", null);
exports.CredentialTokenController = CredentialTokenController = __decorate([
    (0, swagger_1.ApiTags)('Credenciales'),
    (0, common_1.Controller)('credentials'),
    __param(0, (0, common_1.Inject)('ICredentialTokenService')),
    __metadata("design:paramtypes", [Object])
], CredentialTokenController);
//# sourceMappingURL=credential-token.controller.js.map