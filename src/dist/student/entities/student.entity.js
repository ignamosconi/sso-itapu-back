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
exports.StudentEntity = exports.AccountStatus = void 0;
const typeorm_1 = require("typeorm");
const domain_role_entity_js_1 = require("../../domain-role/entities/domain-role.entity.js");
const specialty_entity_js_1 = require("../../specialty/entities/specialty.entity.js");
var AccountStatus;
(function (AccountStatus) {
    AccountStatus["Active"] = "active";
    AccountStatus["Suspended"] = "suspended";
    AccountStatus["PendingRegistration"] = "pending_registration";
})(AccountStatus || (exports.AccountStatus = AccountStatus = {}));
let StudentEntity = class StudentEntity {
    id;
    first_name;
    last_name;
    username;
    email;
    password;
    dni;
    birth_date;
    domainRole;
    domainRoleId;
    specialty;
    specialtyId;
    account_status;
    createdAt;
    updatedAt;
};
exports.StudentEntity = StudentEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], StudentEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], StudentEntity.prototype, "first_name", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 64 }),
    __metadata("design:type", String)
], StudentEntity.prototype, "last_name", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true, length: 64 }),
    __metadata("design:type", String)
], StudentEntity.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], StudentEntity.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, type: 'varchar' }),
    __metadata("design:type", Object)
], StudentEntity.prototype, "password", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', unique: true }),
    __metadata("design:type", Number)
], StudentEntity.prototype, "dni", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", Date)
], StudentEntity.prototype, "birth_date", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => domain_role_entity_js_1.DomainRoleEntity, { eager: true, nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'domain_role_id' }),
    __metadata("design:type", domain_role_entity_js_1.DomainRoleEntity)
], StudentEntity.prototype, "domainRole", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'domain_role_id' }),
    __metadata("design:type", Number)
], StudentEntity.prototype, "domainRoleId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => specialty_entity_js_1.SpecialtyEntity, { eager: true, nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: 'specialty_id' }),
    __metadata("design:type", specialty_entity_js_1.SpecialtyEntity)
], StudentEntity.prototype, "specialty", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'specialty_id' }),
    __metadata("design:type", Number)
], StudentEntity.prototype, "specialtyId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'enum', enum: AccountStatus, default: AccountStatus.PendingRegistration }),
    __metadata("design:type", String)
], StudentEntity.prototype, "account_status", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], StudentEntity.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], StudentEntity.prototype, "updatedAt", void 0);
exports.StudentEntity = StudentEntity = __decorate([
    (0, typeorm_1.Entity)('students')
], StudentEntity);
//# sourceMappingURL=student.entity.js.map