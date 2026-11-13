"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const refresh_token_entity_js_1 = require("./entities/refresh-token.entity.js");
const refresh_token_service_js_1 = require("./services/refresh-token.service.js");
let RefreshTokenModule = class RefreshTokenModule {
};
exports.RefreshTokenModule = RefreshTokenModule;
exports.RefreshTokenModule = RefreshTokenModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([refresh_token_entity_js_1.RefreshTokenEntity])],
        providers: [
            {
                provide: 'IRefreshTokenService',
                useClass: refresh_token_service_js_1.RefreshTokenService,
            },
        ],
        exports: ['IRefreshTokenService'],
    })
], RefreshTokenModule);
//# sourceMappingURL=refresh-token.module.js.map