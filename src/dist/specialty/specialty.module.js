"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecialtyModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const specialty_entity_js_1 = require("./entities/specialty.entity.js");
const specialty_service_js_1 = require("./services/specialty.service.js");
const specialty_controller_js_1 = require("./controllers/specialty.controller.js");
let SpecialtyModule = class SpecialtyModule {
};
exports.SpecialtyModule = SpecialtyModule;
exports.SpecialtyModule = SpecialtyModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([specialty_entity_js_1.SpecialtyEntity])],
        controllers: [specialty_controller_js_1.SpecialtyController],
        providers: [{ provide: 'ISpecialtyService', useClass: specialty_service_js_1.SpecialtyService }],
        exports: ['ISpecialtyService', typeorm_1.TypeOrmModule],
    })
], SpecialtyModule);
//# sourceMappingURL=specialty.module.js.map