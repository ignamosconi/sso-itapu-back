"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthClientModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const oauth_client_entity_js_1 = require("./entities/oauth-client.entity.js");
const oauth_client_service_js_1 = require("./services/oauth-client.service.js");
const oauth_client_controller_js_1 = require("./controllers/oauth-client.controller.js");
const admin_jwt_guard_js_1 = require("../auth/guards/admin-jwt.guard.js");
const credential_token_module_js_1 = require("../credential-token/credential-token.module.js");
const refresh_token_module_js_1 = require("../refresh-token/refresh-token.module.js");
const mail_module_js_1 = require("../mail/mail.module.js");
let OAuthClientModule = class OAuthClientModule {
};
exports.OAuthClientModule = OAuthClientModule;
exports.OAuthClientModule = OAuthClientModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([oauth_client_entity_js_1.OAuthClientEntity]),
            config_1.ConfigModule,
            jwt_1.JwtModule.register({}),
            credential_token_module_js_1.CredentialTokenModule,
            refresh_token_module_js_1.RefreshTokenModule,
            mail_module_js_1.MailModule,
        ],
        controllers: [oauth_client_controller_js_1.OAuthClientController],
        providers: [
            {
                provide: 'IOAuthClientService',
                useClass: oauth_client_service_js_1.OAuthClientService,
            },
            admin_jwt_guard_js_1.AdminJwtGuard,
        ],
        exports: ['IOAuthClientService'],
    })
], OAuthClientModule);
//# sourceMappingURL=oauth-client.module.js.map