"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const auth_controller_js_1 = require("./controllers/auth.controller.js");
const auth_service_js_1 = require("./services/auth.service.js");
const jwt_guard_js_1 = require("./guards/jwt.guard.js");
const admin_jwt_guard_js_1 = require("./guards/admin-jwt.guard.js");
const code_module_js_1 = require("../code/code.module.js");
const oauth_client_module_js_1 = require("../oauth-client/oauth-client.module.js");
const refresh_token_module_js_1 = require("../refresh-token/refresh-token.module.js");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            axios_1.HttpModule,
            config_1.ConfigModule,
            jwt_1.JwtModule.register({}),
            code_module_js_1.CodeModule,
            oauth_client_module_js_1.OAuthClientModule,
            refresh_token_module_js_1.RefreshTokenModule,
        ],
        controllers: [auth_controller_js_1.AuthController],
        providers: [
            {
                provide: 'IAuthService',
                useClass: auth_service_js_1.AuthService,
            },
            jwt_guard_js_1.JwtGuard,
            admin_jwt_guard_js_1.AdminJwtGuard,
        ],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map