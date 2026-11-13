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
exports.CredentialTokenEntity = void 0;
const typeorm_1 = require("typeorm");
let CredentialTokenEntity = class CredentialTokenEntity {
    id;
    tokenHash;
    oauthClientId;
    encryptedSecret;
    clientName;
    redirectUris;
    used;
    expiresAt;
    createdAt;
};
exports.CredentialTokenEntity = CredentialTokenEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], CredentialTokenEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", String)
], CredentialTokenEntity.prototype, "tokenHash", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], CredentialTokenEntity.prototype, "oauthClientId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], CredentialTokenEntity.prototype, "encryptedSecret", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: '' }),
    __metadata("design:type", String)
], CredentialTokenEntity.prototype, "clientName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', default: '[]' }),
    __metadata("design:type", String)
], CredentialTokenEntity.prototype, "redirectUris", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], CredentialTokenEntity.prototype, "used", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Date)
], CredentialTokenEntity.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], CredentialTokenEntity.prototype, "createdAt", void 0);
exports.CredentialTokenEntity = CredentialTokenEntity = __decorate([
    (0, typeorm_1.Entity)('credential_tokens')
], CredentialTokenEntity);
//# sourceMappingURL=credential-token.entity.js.map