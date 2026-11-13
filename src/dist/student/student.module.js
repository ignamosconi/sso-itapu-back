"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const student_entity_js_1 = require("./entities/student.entity.js");
const domain_role_entity_js_1 = require("../domain-role/entities/domain-role.entity.js");
const specialty_entity_js_1 = require("../specialty/entities/specialty.entity.js");
const student_service_js_1 = require("./services/student.service.js");
const student_controller_js_1 = require("./controllers/student.controller.js");
const password_reset_token_module_js_1 = require("../password-reset-token/password-reset-token.module.js");
const mail_module_js_1 = require("../mail/mail.module.js");
let StudentModule = class StudentModule {
};
exports.StudentModule = StudentModule;
exports.StudentModule = StudentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([student_entity_js_1.StudentEntity, domain_role_entity_js_1.DomainRoleEntity, specialty_entity_js_1.SpecialtyEntity]),
            config_1.ConfigModule,
            password_reset_token_module_js_1.PasswordResetTokenModule,
            mail_module_js_1.MailModule,
        ],
        controllers: [student_controller_js_1.StudentController],
        providers: [{ provide: 'IStudentService', useClass: student_service_js_1.StudentService }],
        exports: ['IStudentService'],
    })
], StudentModule);
//# sourceMappingURL=student.module.js.map