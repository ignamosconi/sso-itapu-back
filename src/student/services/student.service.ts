import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, UnauthorizedException, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type { IStudentService } from './student.service.interface.js';
import type { IPasswordResetTokenService } from '../../password-reset-token/services/password-reset-token.service.interface.js';
import type { IMailService } from 'src/mail/services/mail.service.interface.js';
import { StudentEntity, AccountStatus } from '../entities/student.entity.js';
import { DomainRoleEntity } from '../../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../../specialty/entities/specialty.entity.js';
import { CreateStudentDto } from '../dtos/create-student.dto.js';
import { UpdateStudentDto } from '../dtos/update-student.dto.js';
import { DeleteStudentDto } from '../dtos/delete-student.dto.js';
import { StudentResponseDto } from '../dtos/student-response.dto.js';
import { StudentFiltersDto } from '../dtos/student-filters.dto.js';
import { ImportPreviewResultDto, ImportPreviewRowDto } from '../dtos/import-preview-result.dto.js';
import { ImportConfirmDto, ImportConfirmResultDto, ImportStudentRowDto } from '../dtos/import-confirm.dto.js';
import { StudentCredentialsDto } from '../dtos/student-credentials.dto.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StudentService implements IStudentService {
  private readonly adminPanelUrl: string;
  private readonly ssoBaseUrl: string;

  constructor(
    @InjectRepository(StudentEntity)
    private readonly repo: Repository<StudentEntity>,
    @InjectRepository(DomainRoleEntity)
    private readonly domainRoleRepo: Repository<DomainRoleEntity>,
    @InjectRepository(SpecialtyEntity)
    private readonly specialtyRepo: Repository<SpecialtyEntity>,
    @Inject('IPasswordResetTokenService')
    private readonly passwordResetTokenService: IPasswordResetTokenService,
    @Inject('IMailService')
    private readonly mailService: IMailService,
    private readonly configService: ConfigService,
  ) {
    this.adminPanelUrl = this.configService.getOrThrow<string>('ADMIN_PANEL_URL');
    this.ssoBaseUrl = this.configService.getOrThrow<string>('SSO_BASE_URL');
  }

  // ── Mappers ──────────────────────────────────────────────────────────────

  private toDto(e: StudentEntity): StudentResponseDto {
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

  // ── Username generation ──────────────────────────────────────────────────

  private normalizeStr(s: string): string {
    return s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  }

  private buildBaseUsername(firstName: string, lastName: string, dni: number): string {
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

  private async ensureUniqueUsername(base: string): Promise<{ username: string; collision: boolean }> {
    const exists = await this.repo.findOne({ where: { username: base } });
    if (!exists) return { username: base, collision: false };
    let counter = 2;
    while (true) {
      const candidate = `${base}_${counter}`;
      const conflict = await this.repo.findOne({ where: { username: candidate } });
      if (!conflict) return { username: candidate, collision: true };
      counter++;
    }
  }

  // ── Email helpers ────────────────────────────────────────────────────────

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
  }

  private async sendWelcomeEmail(student: StudentEntity): Promise<void> {
    const token = await this.passwordResetTokenService.generate(student.id, 'setup');
    const link = `${this.adminPanelUrl}/set-password?token=${token}`;
    await this.mailService.send(
      student.email,
      'Bienvenido/a a ITAPU — Configurá tu contraseña',
      { html:
        `
        <p>Hola <strong>${student.first_name}</strong>,</p>
        <p>Tu cuenta fue creada en el sistema de ITAPU.</p>
        <p>Tu nombre de usuario es: <strong>${student.username}</strong></p>
        <p>Para configurar tu contraseña hacé clic aquí (el link expira en 24 horas):</p>
        <p><a href="${link}">${link}</a></p>
        <p>Si no esperabas este correo, ignoralo.</p>
        `,
      },
    );
  }

  async sendPasswordResetEmail(student: StudentCredentialsDto): Promise<void> {
    const token = await this.passwordResetTokenService.generate(student.id, 'reset');
    const link = `${this.adminPanelUrl}/set-password?token=${token}`;
    await this.mailService.send(
      student.email,
      'Restaurar contraseña — ITAPU',
      { html:
        `
        <p>Hola <strong>${student.first_name}</strong>,</p>
        <p>Recibimos una solicitud para restaurar tu contraseña.</p>
        <p>Tu nombre de usuario es: <strong>${student.username}</strong></p>
        <p>Hacé clic aquí para elegir una nueva contraseña (válido por 24 horas):</p>
        <p><a href="${link}">${link}</a></p>
        <p>Si no fuiste vos, ignorá este correo.</p>
        `,
      }
    );
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(filters: StudentFiltersDto): Promise<{ data: StudentResponseDto[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const qb = this.repo.createQueryBuilder('s')
      .leftJoinAndSelect('s.domainRole', 'dr')
      .leftJoinAndSelect('s.specialty', 'sp')
      .orderBy('s.last_name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.search) {
      qb.andWhere(
        '(s.username ILIKE :q OR s.first_name ILIKE :q OR s.last_name ILIKE :q OR s.email ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }
    if (filters.domainRoleId) qb.andWhere('s.domain_role_id = :rid', { rid: filters.domainRoleId });
    if (filters.specialtyId) qb.andWhere('s.specialty_id = :sid', { sid: filters.specialtyId });
    if (filters.accountStatus) qb.andWhere('s.account_status = :st', { st: filters.accountStatus });

    const [data, total] = await qb.getManyAndCount();
    return { data: data.map(e => this.toDto(e)), total };
  }

  async findOne(id: string): Promise<StudentResponseDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);
    return this.toDto(entity);
  }

  async create(dto: CreateStudentDto): Promise<StudentResponseDto> {
    const dniExists = await this.repo.findOne({ where: { dni: dto.dni } });
    if (dniExists) throw new ConflictException(`El DNI ${dto.dni} ya está registrado.`);
    const emailExists = await this.repo.findOne({ where: { email: dto.email } });
    if (emailExists) throw new ConflictException(`El email "${dto.email}" ya está registrado.`);

    const domainRole = await this.domainRoleRepo.findOne({ where: { id: dto.domain_role_id } });
    if (!domainRole) throw new NotFoundException(`Rol con id ${dto.domain_role_id} no encontrado.`);
    const specialty = await this.specialtyRepo.findOne({ where: { id: dto.specialty_id } });
    if (!specialty) throw new NotFoundException(`Especialidad con id ${dto.specialty_id} no encontrada.`);

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
      account_status: AccountStatus.PendingRegistration,
    });

    const saved = await this.repo.save(entity);
    // Recargar con relaciones para el DTO
    const full = await this.repo.findOne({ where: { id: saved.id } }) as StudentEntity;

    // Enviar email de bienvenida de forma asíncrona (no bloqueamos la respuesta)
    void this.sendWelcomeEmail(full);

    return this.toDto(full);
  }

  async update(id: string, dto: UpdateStudentDto): Promise<StudentResponseDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);

    if (dto.dni && dto.dni !== entity.dni) {
      const exists = await this.repo.findOne({ where: { dni: dto.dni } });
      if (exists) throw new ConflictException(`El DNI ${dto.dni} ya está registrado.`);
      entity.dni = dto.dni;
    }
    if (dto.first_name) entity.first_name = dto.first_name;
    if (dto.last_name) entity.last_name = dto.last_name;
    if (dto.birth_date) entity.birth_date = new Date(dto.birth_date);
    if (dto.domain_role_id) {
      const role = await this.domainRoleRepo.findOne({ where: { id: dto.domain_role_id } });
      if (!role) throw new NotFoundException(`Rol con id ${dto.domain_role_id} no encontrado.`);
      entity.domainRoleId = dto.domain_role_id;
    }
    if (dto.specialty_id) {
      const spec = await this.specialtyRepo.findOne({ where: { id: dto.specialty_id } });
      if (!spec) throw new NotFoundException(`Especialidad con id ${dto.specialty_id} no encontrada.`);
      entity.specialtyId = dto.specialty_id;
    }

    return this.toDto(await this.repo.save(entity));
  }

  async remove(id: string, dto: DeleteStudentDto): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);

    if (entity.password !== null) {
      if (!dto.password) {
        throw new BadRequestException('Este alumno tiene contraseña configurada. Debés ingresar su contraseña para confirmar la baja.');
      }
      const valid = await bcrypt.compare(dto.password, entity.password);
      if (!valid) throw new UnauthorizedException('La contraseña ingresada es incorrecta.');
    }

    await this.repo.remove(entity);
  }

  async suspend(id: string): Promise<StudentResponseDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);
    if (entity.account_status === AccountStatus.Suspended) {
      throw new BadRequestException('El alumno ya está suspendido.');
    }
    entity.account_status = AccountStatus.Suspended;
    return this.toDto(await this.repo.save(entity));
  }

  async activate(id: string): Promise<StudentResponseDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);
    if (entity.password === null) {
      throw new BadRequestException('No se puede activar una cuenta sin contraseña configurada (registro pendiente).');
    }
    entity.account_status = AccountStatus.Active;
    return this.toDto(await this.repo.save(entity));
  }

  // ── Import CSV ───────────────────────────────────────────────────────────

  generateExampleCsv(): string {
    return [
      'first_name,last_name,dni,email,birth_date,domain_role,specialty',
      'Ignacio Mariano,Mosconi,44244136,alumno@gmail.com,2003-05-15,Alumno,Sistemas',
      'María Elena,García López,33456789,otro@ejemplo.com,1998-11-22,Docente,Mecánica',
    ].join('\n');
  }

  async parseImportPreview(csvBuffer: Buffer): Promise<ImportPreviewResultDto> {
    const lines = csvBuffer.toString('utf-8').split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new BadRequestException('El archivo está vacío o solo tiene encabezados.');

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const required = ['first_name', 'last_name', 'dni', 'email', 'birth_date', 'domain_role', 'specialty'];
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length > 0) {
      throw new BadRequestException(`Faltan columnas requeridas: ${missing.join(', ')}.`);
    }

    const roles = await this.domainRoleRepo.find();
    const roleMap = new Map(roles.map(r => [r.name.toLowerCase(), r]));
    const specs = await this.specialtyRepo.find();
    const specMap = new Map(specs.map(s => [s.name.toLowerCase(), s]));

    const rows: ImportPreviewRowDto[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });

      const errors: string[] = [];
      const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/;

      if (!nameRegex.test(row.first_name)) errors.push('first_name: solo letras y espacios.');
      if (!nameRegex.test(row.last_name)) errors.push('last_name: solo letras y espacios.');
      if (!/^\d{7,}$/.test(row.dni)) errors.push('dni: debe ser un número de al menos 7 dígitos.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('email: formato inválido.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.birth_date)) errors.push('birth_date: formato debe ser YYYY-MM-DD.');
      if (!roleMap.has(row.domain_role.toLowerCase())) errors.push(`domain_role: "${row.domain_role}" no existe.`);
      if (!specMap.has(row.specialty.toLowerCase())) errors.push(`specialty: "${row.specialty}" no existe.`);

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
              domainRoleId: role!.id,
              specialtyId: spec!.id,
            }
          : row,
      });
    }

    const valid = rows.filter(r => r.valid).length;
    return { total: rows.length, valid, invalid: rows.length - valid, rows };
  }

  async confirmImport(dto: ImportConfirmDto): Promise<ImportConfirmResultDto> {
    let collisions = 0;
    const entities: StudentEntity[] = [];

    for (const row of dto.rows) {
      const dniExists = await this.repo.findOne({ where: { dni: row.dni } });
      if (dniExists) continue; // Ya existe, saltear silenciosamente
      const emailExists = await this.repo.findOne({ where: { email: row.email } });
      if (emailExists) continue;

      const base = this.buildBaseUsername(row.first_name, row.last_name, row.dni);
      const { username, collision } = await this.ensureUniqueUsername(base);
      if (collision) collisions++;

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
        account_status: AccountStatus.PendingRegistration,
      }));
    }

    await this.repo.manager.transaction(async manager => {
      await manager.save(StudentEntity, entities);
    });

    // Enviar emails de bienvenida de forma asíncrona
    for (const entity of entities) {
      const full = await this.repo.findOne({ where: { username: entity.username } });
      if (full) void this.sendWelcomeEmail(full);
    }

    return { imported: entities.length, usernameCollisions: collisions };
  }

  // ── Auth internals ───────────────────────────────────────────────────────

  async findForAuth(username: string): Promise<StudentCredentialsDto | null> {
    const entity = await this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.domainRole', 'dr')
      .leftJoinAndSelect('s.specialty', 'sp')
      .where('s.username = :username', { username })
      .getOne();
    if (!entity) return null;
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

  async resendWelcome(id: string): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);
    if (entity.account_status !== AccountStatus.PendingRegistration) {
      throw new BadRequestException(
        'Solo se puede reenviar el email de bienvenida a cuentas con registro pendiente.',
      );
    }
    await this.sendWelcomeEmail(entity);
  }

  async setPassword(studentId: string, hashedPassword: string): Promise<void> {
    const entity = await this.repo.findOne({ where: { id: studentId } });
    if (!entity) throw new NotFoundException(`Alumno con id ${studentId} no encontrado.`);
    if (entity.account_status === AccountStatus.Suspended) {
      throw new UnauthorizedException('La cuenta está suspendida.');
    }
    entity.password = hashedPassword;
    entity.account_status = AccountStatus.Active;
    await this.repo.save(entity);
  }
}