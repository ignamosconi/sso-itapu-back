"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = __importStar(require("bcrypt"));
const admin_entity_js_1 = require("../entities/admin.entity.js");
let AdminService = class AdminService {
    adminRepository;
    refreshTokenService;
    constructor(adminRepository, refreshTokenService) {
        this.adminRepository = adminRepository;
        this.refreshTokenService = refreshTokenService;
    }
    toDto(entity) {
        return {
            id: entity.id,
            username: entity.username,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        };
    }
    async findAll() {
        const admins = await this.adminRepository.find();
        return admins.map(a => this.toDto(a));
    }
    async findOne(id) {
        const admin = await this.adminRepository.findOne({ where: { id } });
        if (!admin)
            throw new common_1.NotFoundException(`Admin con id ${id} no encontrado.`);
        return this.toDto(admin);
    }
    async create(dto) {
        const exists = await this.adminRepository.findOne({ where: { username: dto.username } });
        if (exists)
            throw new common_1.ConflictException(`El username "${dto.username}" ya está en uso.`);
        const hashed = await bcrypt.hash(dto.password, 12);
        const entity = this.adminRepository.create({ username: dto.username, password: hashed });
        return this.toDto(await this.adminRepository.save(entity));
    }
    async updateSelf(id, dto) {
        const admin = await this.adminRepository.findOne({ where: { id } });
        if (!admin)
            throw new common_1.NotFoundException(`Admin con id ${id} no encontrado.`);
        if (dto.username && dto.username !== admin.username) {
            const exists = await this.adminRepository.findOne({ where: { username: dto.username } });
            if (exists)
                throw new common_1.ConflictException(`El username "${dto.username}" ya está en uso.`);
            admin.username = dto.username;
        }
        if (dto.password)
            admin.password = await bcrypt.hash(dto.password, 12);
        return this.toDto(await this.adminRepository.save(admin));
    }
    async removeSelf(id, dto) {
        const admin = await this.adminRepository.findOne({ where: { id } });
        if (!admin)
            throw new common_1.NotFoundException(`Admin con id ${id} no encontrado.`);
        const passwordValid = await bcrypt.compare(dto.password, admin.password);
        if (!passwordValid)
            throw new common_1.UnauthorizedException('La contraseña ingresada es incorrecta.');
        const total = await this.adminRepository.count();
        if (total <= 1)
            throw new common_1.BadRequestException('No se puede eliminar el último administrador del sistema.');
        await this.adminRepository.manager.transaction(async (manager) => {
            await this.refreshTokenService.revokeAllForSub(id, manager);
            await manager.remove(admin);
        });
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(admin_entity_js_1.AdminEntity)),
    __param(1, (0, common_1.Inject)('IRefreshTokenService')),
    __metadata("design:paramtypes", [typeorm_2.Repository, Object])
], AdminService);
//# sourceMappingURL=admin.service.js.map