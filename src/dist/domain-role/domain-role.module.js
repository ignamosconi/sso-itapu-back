"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainRoleModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const domain_role_entity_js_1 = require("./entities/domain-role.entity.js");
const domain_role_service_js_1 = require("./services/domain-role.service.js");
const domain_role_controller_js_1 = require("./controllers/domain-role.controller.js");
let DomainRoleModule = class DomainRoleModule {
};
exports.DomainRoleModule = DomainRoleModule;
exports.DomainRoleModule = DomainRoleModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([domain_role_entity_js_1.DomainRoleEntity])],
        controllers: [domain_role_controller_js_1.DomainRoleController],
        providers: [{ provide: 'IDomainRoleService', useClass: domain_role_service_js_1.DomainRoleService }],
        exports: ['IDomainRoleService', typeorm_1.TypeOrmModule],
    })
], DomainRoleModule);
//# sourceMappingURL=domain-role.module.js.map