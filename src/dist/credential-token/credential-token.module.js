"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialTokenModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const credential_token_entity_js_1 = require("./entities/credential-token.entity.js");
const credential_token_service_js_1 = require("./services/credential-token.service.js");
const credential_token_controller_js_1 = require("./controllers/credential-token.controller.js");
let CredentialTokenModule = class CredentialTokenModule {
};
exports.CredentialTokenModule = CredentialTokenModule;
exports.CredentialTokenModule = CredentialTokenModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([credential_token_entity_js_1.CredentialTokenEntity]),
            config_1.ConfigModule,
        ],
        controllers: [credential_token_controller_js_1.CredentialTokenController],
        providers: [
            {
                provide: 'ICredentialTokenService',
                useClass: credential_token_service_js_1.CredentialTokenService,
            },
        ],
        exports: ['ICredentialTokenService'],
    })
], CredentialTokenModule);
//# sourceMappingURL=credential-token.module.js.map