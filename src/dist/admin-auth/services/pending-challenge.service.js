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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PendingChallengeService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
const redis_module_js_1 = require("../../redis/redis.module.js");
let PendingChallengeService = class PendingChallengeService {
    redis;
    configService;
    ttlMs;
    maxAttempts;
    constructor(redis, configService) {
        this.redis = redis;
        this.configService = configService;
        this.ttlMs = parseInt(this.configService.getOrThrow('PENDING_2FA_TTL_MS'), 10);
        this.maxAttempts = parseInt(this.configService.get('PENDING_2FA_MAX_ATTEMPTS') ?? '5', 10);
    }
    key(jti) {
        return `pending-2fa:${jti}`;
    }
    async create(jti, adminId, purpose) {
        const payload = { adminId, purpose, attempts: 0 };
        try {
            await this.redis.set(this.key(jti), JSON.stringify(payload), 'PX', this.ttlMs);
        }
        catch {
            throw new common_1.ServiceUnavailableException('No se pudo crear el challenge de autenticación. Intentá de nuevo.');
        }
    }
    async verify(jti, expectedPurpose) {
        let raw;
        try {
            raw = await this.redis.get(this.key(jti));
        }
        catch {
            throw new common_1.ServiceUnavailableException('El servicio de autenticación no está disponible. Intentá de nuevo.');
        }
        if (!raw) {
            throw new common_1.UnauthorizedException('Token de sesión pendiente inválido o expirado.');
        }
        const payload = JSON.parse(raw);
        if (payload.purpose !== expectedPurpose) {
            throw new common_1.UnauthorizedException('Token de sesión pendiente inválido para esta operación.');
        }
        return { adminId: payload.adminId };
    }
    async consume(jti, expectedPurpose) {
        let raw;
        try {
            raw = await this.redis.getdel(this.key(jti));
        }
        catch {
            throw new common_1.ServiceUnavailableException('El servicio de autenticación no está disponible. Intentá de nuevo.');
        }
        if (!raw) {
            throw new common_1.UnauthorizedException('Token de sesión pendiente inválido o expirado.');
        }
        const payload = JSON.parse(raw);
        if (payload.purpose !== expectedPurpose) {
            throw new common_1.UnauthorizedException('Token de sesión pendiente inválido para esta operación.');
        }
        return { adminId: payload.adminId };
    }
    async recordAttempt(jti, expectedPurpose, totpValid) {
        const luaScript = `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return 'not_found' end

      local payload = cjson.decode(raw)
      if payload.purpose ~= ARGV[1] then return 'not_found' end

      if ARGV[2] == '1' then
        redis.call('DEL', KEYS[1])
        return 'ok'
      end

      payload.attempts = payload.attempts + 1
      if payload.attempts >= tonumber(ARGV[3]) then
        redis.call('DEL', KEYS[1])
        return 'max_attempts'
      end

      local ttl = redis.call('PTTL', KEYS[1])
      if ttl > 0 then
        redis.call('SET', KEYS[1], cjson.encode(payload), 'PX', ttl)
      else
        redis.call('SET', KEYS[1], cjson.encode(payload))
      end
      return 'retry'
    `;
        let result;
        try {
            result = await this.redis.eval(luaScript, 1, this.key(jti), expectedPurpose, totpValid ? '1' : '0', String(this.maxAttempts));
        }
        catch {
            return { ok: false, reason: 'redis_unavailable' };
        }
        if (result === 'ok')
            return { ok: true };
        if (result === 'max_attempts')
            return { ok: false, reason: 'max_attempts' };
        if (result === 'not_found')
            return { ok: false, reason: 'not_found' };
        return { ok: false, reason: 'not_found' };
    }
};
exports.PendingChallengeService = PendingChallengeService;
exports.PendingChallengeService = PendingChallengeService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(redis_module_js_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [ioredis_1.default,
        config_1.ConfigService])
], PendingChallengeService);
//# sourceMappingURL=pending-challenge.service.js.map