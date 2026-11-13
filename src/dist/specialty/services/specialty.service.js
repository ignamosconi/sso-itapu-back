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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecialtyService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const specialty_entity_js_1 = require("../entities/specialty.entity.js");
let SpecialtyService = class SpecialtyService {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    toDto(e) {
        return { id: e.id, name: e.name, createdAt: e.createdAt, updatedAt: e.updatedAt };
    }
    async findAll() {
        return (await this.repo.find({ order: { name: 'ASC' } })).map(e => this.toDto(e));
    }
    async findOne(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException(`Especialidad con id ${id} no encontrada.`);
        return this.toDto(entity);
    }
    async create(dto) {
        const exists = await this.repo.findOne({ where: { name: dto.name } });
        if (exists)
            throw new common_1.ConflictException(`La especialidad "${dto.name}" ya existe.`);
        return this.toDto(await this.repo.save(this.repo.create({ name: dto.name })));
    }
    async remove(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException(`Especialidad con id ${id} no encontrada.`);
        const [result] = await this.repo.manager.query(`SELECT COUNT(*) FROM students WHERE specialty_id = $1`, [id]);
        if (parseInt(result.count, 10) > 0) {
            throw new common_1.BadRequestException(`No se puede eliminar la especialidad "${entity.name}" porque hay ${result.count} usuario(s) asignado(s) a ella.`);
        }
        await this.repo.remove(entity);
    }
};
exports.SpecialtyService = SpecialtyService;
exports.SpecialtyService = SpecialtyService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(specialty_entity_js_1.SpecialtyEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], SpecialtyService);
//# sourceMappingURL=specialty.service.js.map