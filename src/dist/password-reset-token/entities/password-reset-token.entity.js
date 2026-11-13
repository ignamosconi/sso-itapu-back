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
exports.PasswordResetTokenEntity = void 0;
const typeorm_1 = require("typeorm");
let PasswordResetTokenEntity = class PasswordResetTokenEntity {
    id;
    tokenHash;
    studentId;
    purpose;
    used;
    expiresAt;
    createdAt;
};
exports.PasswordResetTokenEntity = PasswordResetTokenEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PasswordResetTokenEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], PasswordResetTokenEntity.prototype, "tokenHash", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], PasswordResetTokenEntity.prototype, "studentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar' }),
    __metadata("design:type", String)
], PasswordResetTokenEntity.prototype, "purpose", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], PasswordResetTokenEntity.prototype, "used", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Date)
], PasswordResetTokenEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], PasswordResetTokenEntity.prototype, "createdAt", void 0);
exports.PasswordResetTokenEntity = PasswordResetTokenEntity = __decorate([
    (0, typeorm_1.Entity)('password_reset_tokens')
], PasswordResetTokenEntity);
//# sourceMappingURL=password-reset-token.entity.js.map