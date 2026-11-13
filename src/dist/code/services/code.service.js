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
exports.CodeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
let CodeService = class CodeService {
    configService;
    codes = new Map();
    ttlMs;
    purgeInterval;
    constructor(configService) {
        this.configService = configService;
        this.ttlMs = parseInt(this.configService.getOrThrow('CODE_TTL_MS'), 10);
        this.purgeInterval = setInterval(() => this.purgeExpired(), 60_000);
    }
    onModuleDestroy() {
        clearInterval(this.purgeInterval);
    }
    generate(userInfo, clientId) {
        const code = (0, crypto_1.randomUUID)();
        this.codes.set(code, { userInfo, clientId, expiresAt: Date.now() + this.ttlMs });
        return code;
    }
    consume(code) {
        const entry = this.codes.get(code);
        this.codes.delete(code);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt)
            return null;
        return { userInfo: entry.userInfo, clientId: entry.clientId };
    }
    purgeExpired() {
        const now = Date.now();
        for (const [code, entry] of this.codes.entries()) {
            if (now > entry.expiresAt) {
                this.codes.delete(code);
            }
        }
    }
};
exports.CodeService = CodeService;
exports.CodeService = CodeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], CodeService);
//# sourceMappingURL=code.service.js.map