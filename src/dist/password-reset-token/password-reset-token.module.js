"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordResetTokenModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const password_reset_token_entity_js_1 = require("./entities/password-reset-token.entity.js");
const password_reset_token_service_js_1 = require("./services/password-reset-token.service.js");
let PasswordResetTokenModule = class PasswordResetTokenModule {
};
exports.PasswordResetTokenModule = PasswordResetTokenModule;
exports.PasswordResetTokenModule = PasswordResetTokenModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([password_reset_token_entity_js_1.PasswordResetTokenEntity]), config_1.ConfigModule],
        providers: [{ provide: 'IPasswordResetTokenService', useClass: password_reset_token_service_js_1.PasswordResetTokenService }],
        exports: ['IPasswordResetTokenService'],
    })
], PasswordResetTokenModule);
//# sourceMappingURL=password-reset-token.module.js.map