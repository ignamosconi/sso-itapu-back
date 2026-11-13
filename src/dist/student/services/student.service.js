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
exports.StudentService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = __importStar(require("bcrypt"));
const student_entity_js_1 = require("../entities/student.entity.js");
const domain_role_entity_js_1 = require("../../domain-role/entities/domain-role.entity.js");
const specialty_entity_js_1 = require("../../specialty/entities/specialty.entity.js");
const config_1 = require("@nestjs/config");
let StudentService = class StudentService {
    repo;
    domainRoleRepo;
    specialtyRepo;
    passwordResetTokenService;
    mailService;
    configService;
    adminPanelUrl;
    ssoBaseUrl;
    constructor(repo, domainRoleRepo, specialtyRepo, passwordResetTokenService, mailService, configService) {
        this.repo = repo;
        this.domainRoleRepo = domainRoleRepo;
        this.specialtyRepo = specialtyRepo;
        this.passwordResetTokenService = passwordResetTokenService;
        this.mailService = mailService;
        this.configService = configService;
        this.adminPanelUrl = this.configService.getOrThrow('ADMIN_PANEL_URL');
        this.ssoBaseUrl = this.configService.getOrThrow('SSO_BASE_URL');
    }
    toDto(e) {
        return {
            id: e.id,
            username: e.username,
            first_name: e.first_name,
            last_name: e.last_name,
            email: e.email,
            dni: e.dni,
            birth_date: e.birth_date,
            account_status: e.account_status,
            domainRole: { id: e.domainRole.id, name: e.domainRole.name },
            specialty: { id: e.specialty.id, name: e.specialty.name },
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
        };
    }
    normalizeStr(s) {
        return s
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .replace(/[^a-z]/g, '');
    }
    buildBaseUsername(firstName, lastName, dni) {
        const firstPrefix = firstName
            .trim()
            .split(/\s+/)
            .map(w => this.normalizeStr(w).charAt(0))
            .join('');
        const lastSuffix = lastName
            .trim()
            .split(/\s+/)
            .map(w => this.normalizeStr(w))
            .join('');
        const dniSuffix = String(dni).slice(-3);
        return `${firstPrefix}${lastSuffix}${dniSuffix}`;
    }
    async ensureUniqueUsername(base) {
        const exists = await this.repo.findOne({ where: { username: base } });
        if (!exists)
            return { username: base, collision: false };
        let counter = 2;
        while (true) {
            const candidate = `${base}_${counter}`;
            const conflict = await this.repo.findOne({ where: { username: candidate } });
            if (!conflict)
                return { username: candidate, collision: true };
            counter++;
        }
    }
    maskEmail(email) {
        const [local, domain] = email.split('@');
        return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
    }
    async sendWelcomeEmail(student) {
        const token = await this.passwordResetTokenService.generate(student.id, 'setup');
        const link = `${this.adminPanelUrl}/set-password?token=${token}`;
        await this.mailService.send(student.email, 'Bienvenido/a a ITAPU — Configurá tu contraseña', { html: `
        <p>Hola <strong>${student.first_name}</strong>,</p>
        <p>Tu cuenta fue creada en el sistema de ITAPU.</p>
        <p>Tu nombre de usuario es: <strong>${student.username}</strong></p>
        <p>Para configurar tu contraseña hacé clic aquí (el link expira en 24 horas):</p>
        <p><a href="${link}">${link}</a></p>
        <p>Si no esperabas este correo, ignoralo.</p>
        `,
        });
    }
    async sendPasswordResetEmail(student) {
        const token = await this.passwordResetTokenService.generate(student.id, 'reset');
        const link = `${this.adminPanelUrl}/set-password?token=${token}`;
        await this.mailService.send(student.email, 'Restaurar contraseña — ITAPU', { html: `
        <p>Hola <strong>${student.first_name}</strong>,</p>
        <p>Recibimos una solicitud para restaurar tu contraseña.</p>
        <p>Tu nombre de usuario es: <strong>${student.username}</strong></p>
        <p>Hacé clic aquí para elegir una nueva contraseña (válido por 24 horas):</p>
        <p><a href="${link}">${link}</a></p>
        <p>Si no fuiste vos, ignorá este correo.</p>
        `,
        });
    }
    async findAll(filters) {
        const page = filters.page ?? 1;
        const limit = Math.min(filters.limit ?? 20, 100);
        const qb = this.repo.createQueryBuilder('s')
            .leftJoinAndSelect('s.domainRole', 'dr')
            .leftJoinAndSelect('s.specialty', 'sp')
            .orderBy('s.last_name', 'ASC')
            .skip((page - 1) * limit)
            .take(limit);
        if (filters.search) {
            qb.andWhere('(s.username ILIKE :q OR s.first_name ILIKE :q OR s.last_name ILIKE :q OR s.email ILIKE :q)', { q: `%${filters.search}%` });
        }
        if (filters.domainRoleId)
            qb.andWhere('s.domain_role_id = :rid', { rid: filters.domainRoleId });
        if (filters.specialtyId)
            qb.andWhere('s.specialty_id = :sid', { sid: filters.specialtyId });
        if (filters.accountStatus)
            qb.andWhere('s.account_status = :st', { st: filters.accountStatus });
        const [data, total] = await qb.getManyAndCount();
        return { data: data.map(e => this.toDto(e)), total };
    }
    async findOne(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException(`Alumno con id ${id} no encontrado.`);
        return this.toDto(entity);
    }
    async create(dto) {
        const dniExists = await this.repo.findOne({ where: { dni: dto.dni } });
        if (dniExists)
            throw new common_1.ConflictException(`El DNI ${dto.dni} ya está registrado.`);
        const emailExists = await this.repo.findOne({ where: { email: dto.email } });
        if (emailExists)
            throw new common_1.ConflictException(`El email "${dto.email}" ya está registrado.`);
        const domainRole = await this.domainRoleRepo.findOne({ where: { id: dto.domain_role_id } });
        if (!domainRole)
            throw new common_1.NotFoundException(`Rol con id ${dto.domain_role_id} no encontrado.`);
        const specialty = await this.specialtyRepo.findOne({ where: { id: dto.specialty_id } });
        if (!specialty)
            throw new common_1.NotFoundException(`Especialidad con id ${dto.specialty_id} no encontrada.`);
        const base = this.buildBaseUsername(dto.first_name, dto.last_name, dto.dni);
        const { username } = await this.ensureUniqueUsername(base);
        const entity = this.repo.create({
            first_name: dto.first_name,
            last_name: dto.last_name,
            username,
            email: dto.email,
            password: null,
            dni: dto.dni,
            birth_date: new Date(dto.birth_date),
            domainRoleId: dto.domain_role_id,
            specialtyId: dto.specialty_id,
            account_status: student_entity_js_1.AccountStatus.PendingRegistration,
        });
        const saved = await this.repo.save(entity);
        const full = await this.repo.findOne({ where: { id: saved.id } });
        void this.sendWelcomeEmail(full);
        return this.toDto(full);
    }
    async update(id, dto) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException(`Alumno con id ${id} no encontrado.`);
        if (dto.dni && dto.dni !== entity.dni) {
            const exists = await this.repo.findOne({ where: { dni: dto.dni } });
            if (exists)
                throw new common_1.ConflictException(`El DNI ${dto.dni} ya está registrado.`);
            entity.dni = dto.dni;
        }
        if (dto.first_name)
            entity.first_name = dto.first_name;
        if (dto.last_name)
            entity.last_name = dto.last_name;
        if (dto.birth_date)
            entity.birth_date = new Date(dto.birth_date);
        if (dto.domain_role_id) {
            const role = await this.domainRoleRepo.findOne({ where: { id: dto.domain_role_id } });
            if (!role)
                throw new common_1.NotFoundException(`Rol con id ${dto.domain_role_id} no encontrado.`);
            entity.domainRoleId = dto.domain_role_id;
        }
        if (dto.specialty_id) {
            const spec = await this.specialtyRepo.findOne({ where: { id: dto.specialty_id } });
            if (!spec)
                throw new common_1.NotFoundException(`Especialidad con id ${dto.specialty_id} no encontrada.`);
            entity.specialtyId = dto.specialty_id;
        }
        return this.toDto(await this.repo.save(entity));
    }
    async remove(id, dto) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException(`Alumno con id ${id} no encontrado.`);
        if (entity.password !== null) {
            if (!dto.password) {
                throw new common_1.BadRequestException('Este alumno tiene contraseña configurada. Debés ingresar su contraseña para confirmar la baja.');
            }
            const valid = await bcrypt.compare(dto.password, entity.password);
            if (!valid)
                throw new common_1.UnauthorizedException('La contraseña ingresada es incorrecta.');
        }
        await this.repo.remove(entity);
    }
    async suspend(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException(`Alumno con id ${id} no encontrado.`);
        if (entity.account_status === student_entity_js_1.AccountStatus.Suspended) {
            throw new common_1.BadRequestException('El alumno ya está suspendido.');
        }
        entity.account_status = student_entity_js_1.AccountStatus.Suspended;
        return this.toDto(await this.repo.save(entity));
    }
    async activate(id) {
        const entity = await this.repo.findOne({ where: { id } });
        if (!entity)
            throw new common_1.NotFoundException(`Alumno con id ${id} no encontrado.`);
        if (entity.password === null) {
            throw new common_1.BadRequestException('No se puede activar una cuenta sin contraseña configurada (registro pendiente).');
        }
        entity.account_status = student_entity_js_1.AccountStatus.Active;
        return this.toDto(await this.repo.save(entity));
    }
    generateExampleCsv() {
        return [
            'first_name,last_name,dni,email,birth_date,domain_role,specialty',
            'Ignacio Mariano,Mosconi,44244136,alumno@gmail.com,2003-05-15,Alumno,Sistemas',
            'María Elena,García López,33456789,otro@ejemplo.com,1998-11-22,Docente,Mecánica',
        ].join('\n');
    }
    async parseImportPreview(csvBuffer) {
        const lines = csvBuffer.toString('utf-8').split('\n').filter(l => l.trim());
        if (lines.length < 2)
            throw new common_1.BadRequestException('El archivo está vacío o solo tiene encabezados.');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        const required = ['first_name', 'last_name', 'dni', 'email', 'birth_date', 'domain_role', 'specialty'];
        const missing = required.filter(r => !headers.includes(r));
        if (missing.length > 0) {
            throw new common_1.BadRequestException(`Faltan columnas requeridas: ${missing.join(', ')}.`);
        }
        const roles = await this.domainRoleRepo.find();
        const roleMap = new Map(roles.map(r => [r.name.toLowerCase(), r]));
        const specs = await this.specialtyRepo.find();
        const specMap = new Map(specs.map(s => [s.name.toLowerCase(), s]));
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const row = {};
            headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
            const errors = [];
            const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/;
            if (!nameRegex.test(row.first_name))
                errors.push('first_name: solo letras y espacios.');
            if (!nameRegex.test(row.last_name))
                errors.push('last_name: solo letras y espacios.');
            if (!/^\d{7,}$/.test(row.dni))
                errors.push('dni: debe ser un número de al menos 7 dígitos.');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
                errors.push('email: formato inválido.');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(row.birth_date))
                errors.push('birth_date: formato debe ser YYYY-MM-DD.');
            if (!roleMap.has(row.domain_role.toLowerCase()))
                errors.push(`domain_role: "${row.domain_role}" no existe.`);
            if (!specMap.has(row.specialty.toLowerCase()))
                errors.push(`specialty: "${row.specialty}" no existe.`);
            const role = roleMap.get(row.domain_role.toLowerCase());
            const spec = specMap.get(row.specialty.toLowerCase());
            rows.push({
                rowNumber: i,
                valid: errors.length === 0,
                errors: errors.length > 0 ? errors : undefined,
                data: errors.length === 0
                    ? {
                        first_name: row.first_name,
                        last_name: row.last_name,
                        dni: parseInt(row.dni, 10),
                        email: row.email,
                        birth_date: row.birth_date,
                        domainRoleId: role.id,
                        specialtyId: spec.id,
                    }
                    : row,
            });
        }
        const valid = rows.filter(r => r.valid).length;
        return { total: rows.length, valid, invalid: rows.length - valid, rows };
    }
    async confirmImport(dto) {
        let collisions = 0;
        const entities = [];
        for (const row of dto.rows) {
            const dniExists = await this.repo.findOne({ where: { dni: row.dni } });
            if (dniExists)
                continue;
            const emailExists = await this.repo.findOne({ where: { email: row.email } });
            if (emailExists)
                continue;
            const base = this.buildBaseUsername(row.first_name, row.last_name, row.dni);
            const { username, collision } = await this.ensureUniqueUsername(base);
            if (collision)
                collisions++;
            entities.push(this.repo.create({
                first_name: row.first_name,
                last_name: row.last_name,
                username,
                email: row.email,
                password: null,
                dni: row.dni,
                birth_date: new Date(row.birth_date),
                domainRoleId: row.domainRoleId,
                specialtyId: row.specialtyId,
                account_status: student_entity_js_1.AccountStatus.PendingRegistration,
            }));
        }
        await this.repo.manager.transaction(async (manager) => {
            await manager.save(student_entity_js_1.StudentEntity, entities);
        });
        for (const entity of entities) {
            const full = await this.repo.findOne({ where: { username: entity.username } });
            if (full)
                void this.sendWelcomeEmail(full);
        }
        return { imported: entities.length, usernameCollisions: collisions };
    }
    async findForAuth(username) {
        const entity = await this.repo
            .createQueryBuilder('s')
            .leftJoinAndSelect('s.domainRole', 'dr')
            .leftJoinAndSelect('s.specialty', 'sp')
            .where('s.username = :username', { username })
            .getOne();
        if (!entity)
            return null;
        return {
            id: entity.id,
            username: entity.username,
            email: entity.email,
            first_name: entity.first_name,
            last_name: entity.last_name,
            password: entity.password,
            account_status: entity.account_status,
            domainRoleName: entity.domainRole.name,
            specialtyName: entity.specialty.name,
        };
    }
    async setPassword(studentId, hashedPassword) {
        const entity = await this.repo.findOne({ where: { id: studentId } });
        if (!entity)
            throw new common_1.NotFoundException(`Alumno con id ${studentId} no encontrado.`);
        if (entity.account_status === student_entity_js_1.AccountStatus.Suspended) {
            throw new common_1.UnauthorizedException('La cuenta está suspendida.');
        }
        entity.password = hashedPassword;
        entity.account_status = student_entity_js_1.AccountStatus.Active;
        await this.repo.save(entity);
    }
};
exports.StudentService = StudentService;
exports.StudentService = StudentService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(student_entity_js_1.StudentEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(domain_role_entity_js_1.DomainRoleEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(specialty_entity_js_1.SpecialtyEntity)),
    __param(3, (0, common_1.Inject)('IPasswordResetTokenService')),
    __param(4, (0, common_1.Inject)('IMailService')),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository, Object, Object, config_1.ConfigService])
], StudentService);
//# sourceMappingURL=student.service.js.map