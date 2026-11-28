import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, UnauthorizedException, Inject,
  HttpException, HttpStatus, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { button, callout, emailLayout, keyValueTable, note, p } from '../../../mail/utils/email-layout.js';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type { IStudentService } from './student.service.interface.js';
import type { IPasswordResetTokenService } from '../../../password-reset-token/services/password-reset-token.service.interface.js';
import type { IMailService } from '../../../mail/services/mail.service.interface.js';
import { StudentEntity, AccountStatus } from '../entities/student.entity.js';
import { OAuthClientEntity } from '../../../oauth-client/entities/oauth-client.entity.js';
import type { IRefreshTokenService } from '../../../refresh-token/services/refresh-token.service.interface.js';
import { DomainRoleEntity } from '../../../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../../../specialty/entities/specialty.entity.js';
import { CreateStudentDto } from '../dtos/create-student.dto.js';
import { UpdateStudentDto } from '../dtos/update-student.dto.js';
import { DeleteStudentDto } from '../dtos/delete-student.dto.js';
import { StudentResponseDto } from '../dtos/student-response.dto.js';
import { StudentFiltersDto } from '../dtos/student-filters.dto.js';
import { ImportPreviewResultDto, ImportPreviewRowDto } from '../dtos/import-preview-result.dto.js';
import { ImportConfirmDto, ImportConfirmResultDto } from '../dtos/import-confirm.dto.js';
import { StudentCredentialsDto } from '../dtos/student-credentials.dto.js';
import { PasswordLockStatusDto } from '../../password-attempts/dtos/password-lock-status.dto.js';
import { ConfigService } from '@nestjs/config';
import { html } from '../../../mail/utils/email-html.js';
import * as XLSX from 'xlsx';
import type { IPasswordAttemptsService } from '../../password-attempts/services/password-attempts.service.interface.js';
import type { IAdminPasswordConfirmService } from '../../../admin/services/admin-password-confirm.service.interface.js';
import {
  checkAssignmentRules, sortByName, MAX_ROLES_PER_USER, MAX_SPECIALTIES_PER_USER,
} from '../../../domain-role/utils/assignment-rules.js';

/** Un dato que cambió en una edición (para el mail al usuario). */
interface DataChange {
  label: string;
  before: string;
  after: string;
}

@Injectable()
export class StudentService implements IStudentService {
  /** Tope de filas por importación (N5). Debe coincidir con @ArrayMaxSize de ImportConfirmDto. */
  static readonly MAX_IMPORT_ROWS = 500;
  private readonly logger = new Logger(StudentService.name);
  private readonly adminPanelUrl: string;
  private readonly ssoBaseUrl: string;

  constructor(
    @InjectRepository(StudentEntity)
    private readonly repo: Repository<StudentEntity>,
    @InjectRepository(DomainRoleEntity)
    private readonly domainRoleRepo: Repository<DomainRoleEntity>,
    @InjectRepository(SpecialtyEntity)
    private readonly specialtyRepo: Repository<SpecialtyEntity>,
    @InjectRepository(OAuthClientEntity)
    private readonly oauthClientRepo: Repository<OAuthClientEntity>,
    @Inject('IRefreshTokenService')
    private readonly refreshTokenService: IRefreshTokenService,
    @Inject('IPasswordResetTokenService')
    private readonly passwordResetTokenService: IPasswordResetTokenService,
    @Inject('IMailService')
    private readonly mailService: IMailService,
    @Inject('IPasswordAttemptsService')
    private readonly passwordAttempts: IPasswordAttemptsService,
    @Inject('IAdminPasswordConfirmService')
    private readonly adminPasswordConfirm: IAdminPasswordConfirmService,
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
      hasPassword: e.password !== null,
      domainRoles: sortByName(e.domainRoles ?? []).map(r => ({ id: r.id, name: r.name })),
      specialties: sortByName(e.specialties ?? []).map(sp => ({ id: sp.id, name: sp.name })),
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

  /** Los emails se guardan y comparan siempre en minúsculas y sin espacios (N10). */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * `reserved` contiene los usernames ya asignados dentro del mismo lote (import) y que todavía
   * no están en la base: sin esto, dos filas con la misma base generaban el mismo username (N6).
   */
  private async ensureUniqueUsername(
    base: string,
    reserved: Set<string> = new Set(),
  ): Promise<{ username: string; collision: boolean }> {
    const taken = async (u: string) => reserved.has(u) || !!(await this.repo.findOne({ where: { username: u } }));
    if (!(await taken(base))) return { username: base, collision: false };
    let counter = 2;
    while (true) {
      const candidate = `${base}_${counter}`;
      if (!(await taken(candidate))) return { username: candidate, collision: true };
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
      'Bienvenido/a a ITAPU - Configurá tu contraseña',
      {
        html: emailLayout({
          title: 'Bienvenido/a',
          body: html`
            ${p(html`Hola <strong>${student.first_name}</strong>,`)}
            ${p('Tu cuenta fue creada en el sistema de ITAPU.')}
            ${callout(html`Tu nombre de usuario es: <strong>${student.username}</strong>`)}
            ${p('Para configurar tu contraseña hacé clic aquí (el link expira en 24 horas):')}
            ${button('Configurar contraseña', link, 'center')}
            ${note('Si no esperabas este correo, ignoralo.')}
          `,
        }),
      },
    );
  }

  /** Envío en segundo plano: un fallo de SMTP se registra pero nunca tira el proceso. */
  private sendWelcomeEmailSafe(student: StudentEntity): void {
    this.sendWelcomeEmail(student).catch((err: unknown) =>
      this.logger.error(`No se pudo enviar el mail de bienvenida a ${student.id}: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  async sendPasswordResetEmail(student: StudentCredentialsDto): Promise<void> {
    const token = await this.passwordResetTokenService.generate(student.id, 'reset');
    const link = `${this.adminPanelUrl}/set-password?token=${token}`;
    await this.mailService.send(
      student.email,
      'Restaurar contraseña ITAPU',
      {
        html: emailLayout({
          title: 'Restaurar contraseña',
          body: html`
            ${p(html`Hola <strong>${student.first_name}</strong>,`)}
            ${p('Recibimos una solicitud para restaurar tu contraseña.')}
            ${callout(html`Tu nombre de usuario es: <strong>${student.username}</strong>`)}
            ${p('Hacé clic aquí para elegir una nueva contraseña (válido por 24 horas):')}
            ${button('Elegir nueva contraseña', link, 'center')}
            ${note('Al elegir una nueva contraseña se cierran todas las sesiones abiertas en las aplicaciones de ITAPU.')}
            ${note('Si no fuiste vos, ignorá este correo.')}
          `,
        }),
      },
    );
  }

  /**
   * Aviso al usuario de que un administrador modificó sus datos (transparencia del zero trust):
   * si el cambio no estaba autorizado, el usuario se entera y puede avisar.
   */
  private async sendDataChangedEmail(student: StudentEntity, changes: DataChange[]): Promise<void> {
    await this.mailService.send(
      student.email,
      'Se modificaron tus datos en ITAPU',
      {
        html: emailLayout({
          title: 'Se modificaron tus datos',
          body: html`
            ${p(html`Hola <strong>${student.first_name}</strong>,`)}
            ${p('Un administrador de ITAPU modificó los siguientes datos de tu cuenta:')}
            ${keyValueTable(changes.map(c => [c.label, html`<span style="color:#5B5658">Antes:</span> ${c.before}<br><strong>Ahora:</strong> ${c.after}`]))}
            ${p('Los cambios de cargos o especialidades pueden tardar hasta 15 minutos en verse en las aplicaciones de ITAPU, o aplicarse la próxima vez que inicies sesión.')}
            ${callout('Si no reconocés este cambio, comunicate con la administración de ITAPU.', 'info')}
            ${note('Este es un aviso automático. No hace falta que respondas este correo.')}
          `,
        }),
      },
    );
  }

  /** Envío en segundo plano: un fallo de SMTP se registra pero no revierte la edición. */
  private sendDataChangedEmailSafe(student: StudentEntity, changes: DataChange[]): void {
    this.sendDataChangedEmail(student, changes).catch((err: unknown) =>
      this.logger.error(`No se pudo enviar el aviso de cambio de datos a ${student.id}: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  // ── Search helpers ──────────────────────────────────────────────────────────
  
  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  // ── Cargos y especialidades ──────────────────────────────────────────────

  /**
   * Carga los cargos y especialidades pedidos y valida las reglas de asignación.
   * Lo usan el alta, la edición y la confirmación del Excel: un único criterio para todos.
   * Lanza 404 si algún id no existe y 400 (con la lista de reglas violadas) si la combinación no es válida.
   */
  private async resolveAssignment(
    roleIds: number[],
    specialtyIds: number[],
  ): Promise<{ roles: DomainRoleEntity[]; specialties: SpecialtyEntity[] }> {
    const roles = roleIds.length ? await this.domainRoleRepo.find({ where: { id: In(roleIds) } }) : [];
    const missingRoles = roleIds.filter(id => !roles.some(r => r.id === id));
    if (missingRoles.length) {
      throw new NotFoundException(`Cargo(s) con id ${missingRoles.join(', ')} no encontrado(s).`);
    }
    const specialties = specialtyIds.length ? await this.specialtyRepo.find({ where: { id: In(specialtyIds) } }) : [];
    const missingSpecs = specialtyIds.filter(id => !specialties.some(sp => sp.id === id));
    if (missingSpecs.length) {
      throw new NotFoundException(`Especialidad(es) con id ${missingSpecs.join(', ')} no encontrada(s).`);
    }
    const errors = checkAssignmentRules(roles, specialties.length);
    if (errors.length) throw new BadRequestException(errors);
    return { roles: sortByName(roles), specialties: sortByName(specialties) };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(filters: StudentFiltersDto): Promise<{ data: StudentResponseDto[]; total: number }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const qb = this.repo.createQueryBuilder('s')
      .leftJoinAndSelect('s.domainRoles', 'dr')
      .leftJoinAndSelect('s.specialties', 'sp')
      .orderBy('s.last_name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.search) {
      // Cada palabra debe aparecer en usuario, nombre, apellido o DNI (sin tildes).
      // El email NO se busca a propósito.
      const words = filters.search.normalize('NFC').trim().split(/\s+/).filter(Boolean);
      words.forEach((word, i) => {
        const params: Record<string, string> = { [`q${i}`]: `%${this.escapeLike(word)}%` };
        const conditions = [
          `unaccent(s.username) ILIKE unaccent(:q${i})`,
          `unaccent(s.first_name) ILIKE unaccent(:q${i})`,
          `unaccent(s.last_name) ILIKE unaccent(:q${i})`,
        ];
        // Solo si la palabra tiene dígitos: con "%%" el DNI coincidiría siempre.
        const digits = word.replace(/\D/g, '');
        if (digits) {
          conditions.push(`CAST(s.dni AS TEXT) LIKE :d${i}`);
          params[`d${i}`] = `%${digits}%`;
        }
        qb.andWhere(`(${conditions.join(' OR ')})`, params);
      });
    }
    // EXISTS en vez de filtrar el JOIN: así el usuario sigue trayendo TODOS sus cargos/especialidades.
    if (filters.domainRoleId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM student_domain_roles f_dr WHERE f_dr.student_id = s.id AND f_dr.domain_role_id = :rid)',
        { rid: filters.domainRoleId },
      );
    }
    if (filters.specialtyId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM student_specialties f_sp WHERE f_sp.student_id = s.id AND f_sp.specialty_id = :sid)',
        { sid: filters.specialtyId },
      );
    }
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
    const email = this.normalizeEmail(dto.email);
    const emailExists = await this.repo
      .createQueryBuilder('s').select('s.id').where('LOWER(s.email) = :email', { email }).getOne();
    if (emailExists) throw new ConflictException(`El email "${email}" ya está registrado.`);

    const { roles, specialties } = await this.resolveAssignment(dto.domain_role_ids, dto.specialty_ids);

    const base = this.buildBaseUsername(dto.first_name, dto.last_name, dto.dni);
    const { username } = await this.ensureUniqueUsername(base);

    const entity = this.repo.create({
      first_name: dto.first_name,
      last_name: dto.last_name,
      username,
      email,
      password: null,
      dni: dto.dni,
      birth_date: new Date(dto.birth_date),
      domainRoles: roles,
      specialties,
      account_status: AccountStatus.PendingRegistration,
    });

    const saved = await this.repo.save(entity);
    // Recargar con relaciones para el DTO
    const full = await this.repo.findOne({ where: { id: saved.id } }) as StudentEntity;

    // Enviar email de bienvenida de forma asíncrona (no bloqueamos la respuesta)
    this.sendWelcomeEmailSafe(full);

    return this.toDto(full);
  }

  /**
   * Edición de un usuario por un admin. Controles (zero trust):
   *  1. El admin confirma con SU contraseña (step-up, con límite de intentos por admin).
   *  2. Cargos y especialidades pasan por las mismas reglas que el alta (checkAssignmentRules).
   *  3. El usuario recibe un mail con el antes y el después de cada dato que cambió.
   * El email y la contraseña no se editan acá (tienen flujos propios). El username no cambia.
   * Los cambios llegan a las apps en la próxima renovación del token (el refresh relee la base).
   */
  async update(id: string, dto: UpdateStudentDto, adminId: string): Promise<StudentResponseDto> {
    const { admin_password: adminPassword, ...fields } = dto;
    if (!Object.values(fields).some(v => v !== undefined)) {
      throw new BadRequestException('No se enviaron cambios para actualizar.');
    }

    // Primero la contraseña del admin: sin ella no se revela ni siquiera si el usuario existe.
    await this.adminPasswordConfirm.verify(adminId, adminPassword);

    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);

    const changes: DataChange[] = [];
    const fmtDate = (d: Date | string) => {
      const iso = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
      const [y, m, day] = iso.split('-');
      return `${day}/${m}/${y}`;
    };
    const names = (items: { name: string }[]) => sortByName(items).map(i => i.name).join(', ');

    if (fields.first_name !== undefined && fields.first_name !== entity.first_name) {
      changes.push({ label: 'Nombre/s', before: entity.first_name, after: fields.first_name });
      entity.first_name = fields.first_name;
    }
    if (fields.last_name !== undefined && fields.last_name !== entity.last_name) {
      changes.push({ label: 'Apellido/s', before: entity.last_name, after: fields.last_name });
      entity.last_name = fields.last_name;
    }
    if (fields.dni !== undefined && fields.dni !== entity.dni) {
      const exists = await this.repo.findOne({ where: { dni: fields.dni } });
      if (exists) throw new ConflictException(`El DNI ${fields.dni} ya está registrado.`);
      changes.push({ label: 'DNI', before: String(entity.dni), after: String(fields.dni) });
      entity.dni = fields.dni;
    }
    if (fields.birth_date !== undefined && fmtDate(fields.birth_date) !== fmtDate(entity.birth_date)) {
      changes.push({ label: 'Fecha de nacimiento', before: fmtDate(entity.birth_date), after: fmtDate(fields.birth_date) });
      entity.birth_date = new Date(fields.birth_date);
    }

    if (fields.domain_role_ids !== undefined || fields.specialty_ids !== undefined) {
      // Se valida la combinación FINAL: lo que cambia más lo que se conserva.
      const roleIds = fields.domain_role_ids ?? entity.domainRoles.map(r => r.id);
      const specIds = fields.specialty_ids ?? entity.specialties.map(sp => sp.id);
      const { roles, specialties } = await this.resolveAssignment(roleIds, specIds);

      const beforeRoles = names(entity.domainRoles);
      const beforeSpecs = names(entity.specialties);
      if (names(roles) !== beforeRoles) {
        changes.push({ label: 'Cargos', before: beforeRoles, after: names(roles) });
      }
      if (names(specialties) !== beforeSpecs) {
        changes.push({ label: 'Especialidades', before: beforeSpecs, after: names(specialties) });
      }
      entity.domainRoles = roles;
      entity.specialties = specialties;
    }

    if (changes.length === 0) {
      throw new BadRequestException('No hay cambios: los datos enviados son iguales a los actuales.');
    }

    const saved = await this.repo.save(entity);
    this.sendDataChangedEmailSafe(saved, changes);
    return this.toDto(saved);
  }

  async remove(id: string, dto: DeleteStudentDto): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);

    // Verificar si el usuario es responsable de alguna app OAuth
    const responsibleApps = await this.oauthClientRepo.find({
      where: { responsibleUserId: id },
      select: { id: true, clientName: true },
    });
    if (responsibleApps.length > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.CONFLICT,
          message: 'No es posible eliminar a este usuario porque es responsable de apps OAuth.',
          responsibleApps: responsibleApps.map(a => ({ id: a.id, clientName: a.clientName })),
        },
        HttpStatus.CONFLICT,
      );
    }

    if (entity.password !== null) {
      if (!dto.password) {
        throw new BadRequestException('Este alumno tiene contraseña configurada. Debés ingresar su contraseña para confirmar la baja.');
      }
      // Se registra el intento ANTES de comparar: así los intentos en paralelo también cuentan
      // y, al superar el máximo, se corta con 429 sin llegar a ejecutar bcrypt.
      const attempt = await this.passwordAttempts.registerAttempt(id);
      const valid = await bcrypt.compare(dto.password, entity.password);
      if (!valid) {
        // 403 y no 401: el 401 del panel significa "tu sesión de admin venció" y hace que el front
        // renueve el token y REPITA el request, lo que gastaría dos intentos por cada contraseña mal escrita.
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          message: 'La contraseña ingresada es incorrecta.',
          attemptsRemaining: attempt.attemptsRemaining,
          retryAfterSeconds: attempt.retryAfterSeconds,
        });
      }
      await this.passwordAttempts.reset(id);
    }

    // Cortar las sesiones ANTES de borrar: sin esto el alumno dado de baja seguiría renovando tokens
    // hasta que venza su sesión (el refresh no consulta la base).
    // LIMITACIÓN CONOCIDA: sus access tokens ya emitidos siguen siendo válidos hasta su vencimiento
    // (JWT_ACCESS_EXPIRES_IN, por defecto 15 minutos).
    await this.refreshTokenService.revokeAllForSub(id);
    await this.repo.remove(entity);
  }

  async getPasswordLockStatus(id: string): Promise<PasswordLockStatusDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);
    // Sin contraseña no hay nada que adivinar: la baja no pide contraseña.
    if (entity.password === null) return { locked: false, retryAfterSeconds: 0 };
    return this.passwordAttempts.getLockStatus(id);
  }

  async suspend(id: string): Promise<StudentResponseDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);
    if (entity.account_status === AccountStatus.Suspended) {
      throw new BadRequestException('El alumno ya está suspendido.');
    }

    entity.account_status = AccountStatus.Suspended;
    const saved = await this.repo.save(entity);

    // Cerrar las sesiones del propio alumno: la suspensión solo impide loguearse de nuevo, pero un
    // refresh token vigente seguiría renovando tokens hasta 3 días.
    // LIMITACIÓN CONOCIDA: sus access tokens ya emitidos siguen siendo válidos hasta su vencimiento
    // (JWT_ACCESS_EXPIRES_IN, por defecto 15 minutos).
    await this.refreshTokenService.revokeAllForSub(id);

    // Cascade: suspender apps y revocar sesiones activas
    const apps = await this.oauthClientRepo.find({ where: { responsibleUserId: id } });
    for (const app of apps) {
      if (app.isActive) {
        await this.refreshTokenService.revokeAllForClient(app.id);
        app.isActive = false;
        await this.oauthClientRepo.save(app);
      }
    }

    return this.toDto(saved);
  }

  async activate(id: string): Promise<StudentResponseDto> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Alumno con id ${id} no encontrado.`);
    entity.account_status = entity.password === null
      ? AccountStatus.PendingRegistration
      : AccountStatus.Active;
    const saved = await this.repo.save(entity);

    // Cascade: reactivar todas las apps de las que este usuario es responsable
    const apps = await this.oauthClientRepo.find({ where: { responsibleUserId: id } });
    for (const app of apps) {
      if (!app.isActive) {
        app.isActive = true;
        await this.oauthClientRepo.save(app);
      }
    }

    return this.toDto(saved);
  }

  // ── Import Excel ───────────────────────────────────────────────────────────

  /**
   * Excel de ejemplo para la carga masiva.
   *  - Columnas A-G: los datos. Filas de ejemplo con un cargo y una especialidad, y con varios de cada uno.
   *  - Columnas I-K: los cargos válidos con sus reglas ("¿Se combina con otros cargos?" y "Especialidades").
   *  - Columna M: las especialidades válidas.
   *  - Debajo de los cargos: cómo cargar varios valores en una celda.
   * Las filas de referencia no tienen DNI, así que la importación las ignora.
   */
  async generateExampleXlsx(): Promise<Buffer> {
    const roles = await this.domainRoleRepo.find({ order: { name: 'ASC' } });
    const specs = await this.specialtyRepo.find({ order: { name: 'ASC' } });
    const sep = '; ';

    const headers = ['Nombre/s', 'Apellido/s', 'DNI', 'Email', 'Fecha de nacimiento', 'Cargo', 'Especialidad'];

    // Ejemplos que respetan las reglas reales del sistema (si no hay datos suficientes, nombres genéricos).
    const restricted = roles.find(r => r.exclusive || r.singleSpecialty);
    const combinable = roles.filter(r => !r.exclusive && !r.singleSpecialty);
    const singleRole = restricted?.name ?? roles[0]?.name ?? 'Alumno';
    const multiRoles = combinable.length >= 2 ? `${combinable[0].name}${sep}${combinable[1].name}` : `Profesor${sep}Preceptor`;
    const otherRole = combinable[0]?.name ?? roles.find(r => r.name !== singleRole)?.name ?? 'Autoridad';
    const spec1 = specs[0]?.name ?? 'Mecánica';
    const multiSpecs = specs.length >= 2 ? `${specs[0].name}${sep}${specs[1].name}` : `Mecánica${sep}Electrónica`;

    const exampleRows = [
      ['Ignacio Mariano', 'Mosconi', 30123456, 'alumno@gmail.com', new Date(2003, 4, 15), singleRole, spec1],
      ['Ana', 'Pérez', 33456789, 'ana@ejemplo.com', new Date(1998, 10, 22), multiRoles, multiSpecs],
      ['Carlos', 'Gómez', 28123456, 'carlos@ejemplo.com', new Date(1980, 2, 10), otherRole, spec1],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleRows]);

    // Formato de fecha DD/MM/YYYY en columna E (índice 4)
    exampleRows.forEach((_, i) => {
      const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 4 })] as XLSX.CellObject | undefined;
      if (cell) cell.z = 'DD/MM/YYYY';
    });

    const setCellValue = (r: number, c: number, v: string, bold = false) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      ws[ref] = { t: 's', v, s: bold ? { font: { bold: true } } : {} };
      const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
      if (c > range.e.c) range.e.c = c;
      if (r > range.e.r) range.e.r = r;
      ws['!ref'] = XLSX.utils.encode_range(range);
    };

    // Columnas de referencia: I (8), J (9), K (10) para cargos y sus reglas; M (12) para especialidades.
    const colRole = 8, colCombines = 9, colSpecRule = 10, colSpecs = 12;
    setCellValue(0, colRole, 'Cargos válidos', true);
    setCellValue(0, colCombines, '¿Se combina con otros cargos?', true);
    setCellValue(0, colSpecRule, 'Especialidades permitidas', true);
    setCellValue(0, colSpecs, 'Especialidades válidas', true);

    roles.forEach((r, i) => {
      setCellValue(i + 1, colRole, r.name);
      setCellValue(i + 1, colCombines, r.exclusive ? 'No: debe ser el único cargo' : 'Sí');
      setCellValue(i + 1, colSpecRule, r.singleSpecialty ? 'Exactamente una' : 'Una o más');
    });
    specs.forEach((sp, i) => setCellValue(i + 1, colSpecs, sp.name));

    const helpRow = roles.length + 2;
    setCellValue(helpRow, colRole, 'Cómo cargar varios valores', true);
    setCellValue(helpRow + 1, colRole, `Separalos con punto y coma en la misma celda. Ej.: "Profesor${sep}Preceptor".`);
    setCellValue(helpRow + 2, colRole, 'Todo usuario necesita al menos un cargo y al menos una especialidad.');
    setCellValue(helpRow + 3, colRole, 'Si alguno de los cargos no se combina, debe ser el único cargo de la fila.');
    setCellValue(helpRow + 4, colRole, 'Si alguno de los cargos exige exactamente una especialidad, la fila debe tener una sola.');
    setCellValue(helpRow + 5, colRole, 'Las filas que no cumplan estas reglas se marcan como inválidas y no se importan.');

    ws['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 28 },
      { wch: 22 }, { wch: 26 }, { wch: 26 },
      { wch: 4 },                              // H vacía
      { wch: 24 }, { wch: 30 }, { wch: 26 },   // I, J, K
      { wch: 4 },                              // L vacía
      { wch: 26 },                             // M
    ];

    headers.forEach((_, c) => {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })] as (XLSX.CellObject & { s?: unknown }) | undefined;
      if (cell) cell.s = { font: { bold: true } };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true }));
  }

  /** Separa una celda con varios valores ("Profesor; Preceptor" o "Profesor, Preceptor"). */
  private splitMulti(raw: string): string[] {
    return raw.split(/[;,]/).map(v => v.trim()).filter(Boolean);
  }

  private cellToString(val: unknown): string {
    if (typeof val === 'string') return val.trim();
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return '';
  }

  private parseBirthDate(raw: unknown): string {
    // Celda con formato fecha de Excel → SheetJS devuelve Date
    if (raw instanceof Date) {
      const d = raw;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const s = this.cellToString(raw);
    // DD/MM/AAAA o D/M/AAAA (texto plano, formato argentino)
    const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmm) {
      const [, day, month, year] = ddmm;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    // YYYY-MM-DD ya está bien
    return s;
  }

  async parseImportPreview(xlsxBuffer: Buffer): Promise<ImportPreviewResultDto> {
    // sheetRows limita cuánto parsea SheetJS (encabezado + MAX_IMPORT_ROWS + margen para la tabla de referencia).
    const wb = XLSX.read(xlsxBuffer, { type: 'buffer', cellDates: true, sheetRows: StudentService.MAX_IMPORT_ROWS + 50 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new BadRequestException('El archivo no contiene hojas de cálculo.');

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (rawRows.length === 0) throw new BadRequestException('El archivo está vacío o solo tiene encabezados.');

    // Mapeo de encabezados español → campo interno
    const normalizeHeader = (h: string): string => {
      const map: Record<string, string> = {
        'nombre/s': 'first_name', 'nombres': 'first_name',
        'apellido/s': 'last_name', 'apellidos': 'last_name',
        'dni': 'dni', 'email': 'email',
        'fecha de nacimiento': 'birth_date',
        'cargo': 'domain_role',
        'especialidad': 'specialty',
        // compatibilidad con encabezados ingleses anteriores
        'first_name': 'first_name', 'last_name': 'last_name',
        'birth_date': 'birth_date', 'domain_role': 'domain_role',
        'specialty': 'specialty',
      };
      return map[h.trim().toLowerCase()] ?? h.trim().toLowerCase();
    };

    // Normalizar claves de cada fila, ignorar filas de la sección de referencia (DNI vacío)
    const rows = rawRows
      .map(raw => {
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) {
          normalized[normalizeHeader(k)] = v;
        }
        return normalized;
      })
      .filter(row => {
        // Filtrar filas vacías y la sección de valores de referencia (sin DNI real)
        const dni = row['dni'];
        return dni !== '' && dni !== undefined && dni !== null;
      });

    if (rows.length === 0) throw new BadRequestException('El archivo no contiene filas de datos.');
    if (rows.length > StudentService.MAX_IMPORT_ROWS) {
      throw new BadRequestException(`El archivo supera el máximo de ${StudentService.MAX_IMPORT_ROWS} alumnos por importación. Dividilo en partes.`);
    }

    const required = ['first_name', 'last_name', 'dni', 'email', 'birth_date', 'domain_role', 'specialty'];
    const spanishNames: Record<string, string> = {
      first_name: 'Nombre/s', last_name: 'Apellido/s', dni: 'DNI',
      email: 'Email', birth_date: 'Fecha de nacimiento',
      domain_role: 'Cargo', specialty: 'Especialidad',
    };
    const headers = Object.keys(rows[0]);
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltan columnas requeridas: ${missing.map(m => spanishNames[m] ?? m).join(', ')}.`,
      );
    }

    const roles = await this.domainRoleRepo.find();
    const roleMap = new Map(roles.map(r => [r.name.toLowerCase(), r]));
    const specs = await this.specialtyRepo.find();
    const specMap = new Map(specs.map(s => [s.name.toLowerCase(), s]));

    // Una sola consulta por tipo de dato en vez de dos por fila (N5).
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const parseDni = (v: unknown) => (typeof v === 'number' ? v : parseInt(String(v), 10));
    const dnisInFile = rows.map(r => parseDni(r['dni'])).filter(d => !isNaN(d) && d >= 1000000);
    const emailsInFile = rows.map(r => this.normalizeEmail(this.cellToString(r['email']))).filter(e => emailRegex.test(e));
    const existingByDni = new Map<number, StudentEntity>();
    if (dnisInFile.length) {
      for (const st of await this.repo.find({ where: { dni: In(dnisInFile) }, select: { id: true, dni: true, username: true } })) existingByDni.set(st.dni, st);
    }
    const existingEmails = new Set<string>();
    if (emailsInFile.length) {
      const found = await this.repo.createQueryBuilder('s').select('LOWER(s.email)', 'email')
        .where('LOWER(s.email) IN (:...emails)', { emails: emailsInFile }).getRawMany<{ email: string }>();
      found.forEach(f => existingEmails.add(f.email));
    }
    const seenDni = new Set<number>();
    const seenEmail = new Set<string>();

    const result: ImportPreviewRowDto[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const errors: string[] = [];
      const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/;

      const firstName = this.cellToString(row['first_name']);
      const lastName = this.cellToString(row['last_name']);
      const dniRaw = row['dni'];
      const email = this.cellToString(row['email']);
      const domainRoleRaw = this.cellToString(row['domain_role']);
      const specialtyRaw = this.cellToString(row['specialty']);

      const birthDate = this.parseBirthDate(row['birth_date']);

      if (!nameRegex.test(firstName)) errors.push('Nombre/s: solo letras y espacios.');
      if (!nameRegex.test(lastName)) errors.push('Apellido/s: solo letras y espacios.');

      const dni = typeof dniRaw === 'number' ? dniRaw : parseInt(String(dniRaw), 10);
      if (isNaN(dni) || dni < 1000000) errors.push('DNI: debe ser un número de al menos 7 dígitos.');

      if (!emailRegex.test(email)) errors.push('Email: formato inválido.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) errors.push('Fecha de nacimiento: usá formato DD/MM/AAAA o formato fecha de Excel. No uses guiones ni texto.');
      // Cargos y especialidades: uno o varios por celda, existentes, sin repetir, y con las reglas de cada cargo.
      const roleNames = this.splitMulti(domainRoleRaw);
      const specNames = this.splitMulti(specialtyRaw);
      const rowRoles: DomainRoleEntity[] = [];
      const rowSpecs: SpecialtyEntity[] = [];
      if (roleNames.length > MAX_ROLES_PER_USER) errors.push(`Cargo: máximo ${MAX_ROLES_PER_USER} cargos por usuario.`);
      if (specNames.length > MAX_SPECIALTIES_PER_USER) errors.push(`Especialidad: máximo ${MAX_SPECIALTIES_PER_USER} especialidades por usuario.`);
      for (const name of roleNames.slice(0, MAX_ROLES_PER_USER)) {
        const role = roleMap.get(name.toLowerCase());
        if (!role) errors.push(`Cargo: "${name}" no existe en el sistema.`);
        else if (rowRoles.includes(role)) errors.push(`Cargo: "${name}" está repetido.`);
        else rowRoles.push(role);
      }
      for (const name of specNames.slice(0, MAX_SPECIALTIES_PER_USER)) {
        const spec = specMap.get(name.toLowerCase());
        if (!spec) errors.push(`Especialidad: "${name}" no existe en el sistema.`);
        else if (rowSpecs.includes(spec)) errors.push(`Especialidad: "${name}" está repetida.`);
        else rowSpecs.push(spec);
      }
      // Con nombres inexistentes no se evalúan las reglas (el error ya está informado arriba).
      const allRolesKnown = rowRoles.length === roleNames.length || roleNames.length > MAX_ROLES_PER_USER;
      const allSpecsKnown = rowSpecs.length === specNames.length || specNames.length > MAX_SPECIALTIES_PER_USER;
      if (roleNames.length === 0) errors.push('Cargo: indicá al menos un cargo.');
      if (specNames.length === 0) errors.push('Especialidad: indicá al menos una especialidad.');
      if (roleNames.length > 0 && specNames.length > 0 && allRolesKnown && allSpecsKnown) {
        for (const ruleError of checkAssignmentRules(rowRoles, rowSpecs.length)) errors.push(`Reglas del cargo: ${ruleError}`);
      }

      // Duplicados contra la DB (consultas por lote hechas arriba) y dentro del propio archivo
      const dniNum = parseDni(dniRaw);
      if (!isNaN(dniNum) && dniNum >= 1000000) {
        const dniExists = existingByDni.get(dniNum);
        if (dniExists) errors.push(`DNI: ${dniNum} ya está registrado en el sistema (usuario: ${dniExists.username}).`);
        else if (seenDni.has(dniNum)) errors.push(`DNI: ${dniNum} está repetido en el archivo.`);
        seenDni.add(dniNum);
      }
      const emailNorm = this.normalizeEmail(email);
      if (emailRegex.test(emailNorm)) {
        if (existingEmails.has(emailNorm)) errors.push(`Email: "${email}" ya está registrado en el sistema.`);
        else if (seenEmail.has(emailNorm)) errors.push(`Email: "${email}" está repetido en el archivo.`);
        seenEmail.add(emailNorm);
      }

      result.push({
        rowNumber: i + 1,
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        // Fila válida: exactamente la forma de ImportStudentRowDto (se manda tal cual a /import/confirm).
        // Fila inválida: los valores crudos del archivo, para mostrarlos junto a los errores.
        data: errors.length === 0
          ? {
              first_name: firstName, last_name: lastName, dni, email: emailNorm, birth_date: birthDate,
              domainRoleIds: sortByName(rowRoles).map(r => r.id),
              specialtyIds: sortByName(rowSpecs).map(sp => sp.id),
            }
          : { first_name: firstName, last_name: lastName, dni: dniRaw, email, birth_date: birthDate, domain_role: domainRoleRaw, specialty: specialtyRaw },
      });
    }

    const valid = result.filter(r => r.valid).length;
    return { total: result.length, valid, invalid: result.length - valid, rows: result };
  }

  async confirmImport(dto: ImportConfirmDto): Promise<ImportConfirmResultDto> {
    let collisions = 0;
    const entities: StudentEntity[] = [];

    // Consultas por lote (N5) y normalización de email (N10)
    const rows = dto.rows.map(r => ({ ...r, email: this.normalizeEmail(r.email) }));
    const existingDnis = new Set<number>();
    const existingEmails = new Set<string>();
    if (rows.length) {
      (await this.repo.find({ where: { dni: In(rows.map(r => r.dni)) }, select: { id: true, dni: true } }))
        .forEach(st => existingDnis.add(st.dni));
      (await this.repo.createQueryBuilder('s').select('LOWER(s.email)', 'email')
        .where('LOWER(s.email) IN (:...emails)', { emails: rows.map(r => r.email) }).getRawMany<{ email: string }>())
        .forEach(f => existingEmails.add(f.email));
    }
    // Las reglas se vuelven a validar acá: no se confía en lo que devolvió la vista previa
    // (el body de este endpoint lo arma el cliente y podría venir modificado).
    const allRoleIds = [...new Set(rows.flatMap(r => r.domainRoleIds))];
    const allSpecIds = [...new Set(rows.flatMap(r => r.specialtyIds))];
    const roleById = new Map((await this.domainRoleRepo.find({ where: { id: In(allRoleIds) } })).map(r => [r.id, r]));
    const specById = new Map((await this.specialtyRepo.find({ where: { id: In(allSpecIds) } })).map(sp => [sp.id, sp]));
    const rowErrors: string[] = [];
    rows.forEach((row, i) => {
      const missingRoles = row.domainRoleIds.filter(id => !roleById.has(id));
      const missingSpecs = row.specialtyIds.filter(id => !specById.has(id));
      if (missingRoles.length) rowErrors.push(`Fila ${i + 1}: cargo(s) con id ${missingRoles.join(', ')} no encontrado(s).`);
      if (missingSpecs.length) rowErrors.push(`Fila ${i + 1}: especialidad(es) con id ${missingSpecs.join(', ')} no encontrada(s).`);
      if (missingRoles.length || missingSpecs.length) return;
      const roles = row.domainRoleIds.map(id => roleById.get(id)!);
      for (const err of checkAssignmentRules(roles, row.specialtyIds.length)) rowErrors.push(`Fila ${i + 1}: ${err}`);
    });
    if (rowErrors.length) {
      throw new BadRequestException([
        'La importación no se realizó: hay filas que no cumplen las reglas de los cargos. Volvé a generar la vista previa.',
        ...rowErrors.slice(0, 50),
      ]);
    }

    const reserved = new Set<string>();

    for (const row of rows) {
      if (existingDnis.has(row.dni) || existingEmails.has(row.email)) continue; // Ya existe, saltear
      existingDnis.add(row.dni);       // también evita duplicados dentro del mismo lote
      existingEmails.add(row.email);

      const base = this.buildBaseUsername(row.first_name, row.last_name, row.dni);
      const { username, collision } = await this.ensureUniqueUsername(base, reserved);
      reserved.add(username);
      if (collision) collisions++;

      entities.push(this.repo.create({
        first_name: row.first_name,
        last_name: row.last_name,
        username,
        email: row.email,
        password: null,
        dni: row.dni,
        birth_date: new Date(row.birth_date),
        domainRoles: row.domainRoleIds.map(id => roleById.get(id)!),
        specialties: row.specialtyIds.map(id => specById.get(id)!),
        account_status: AccountStatus.PendingRegistration,
      }));
    }

    await this.repo.manager.transaction(async manager => {
      await manager.save(StudentEntity, entities);
    });

    // Mails de bienvenida en segundo plano; una sola consulta para recargar con relaciones
    if (entities.length) {
      const fulls = await this.repo.find({ where: { username: In(entities.map(e => e.username)) } });
      for (const full of fulls) this.sendWelcomeEmailSafe(full);
    }

    return { imported: entities.length, usernameCollisions: collisions };
  }

  // ── Auth internals ───────────────────────────────────────────────────────

  async findForAuth(username: string): Promise<StudentCredentialsDto | null> {
    const entity = await this.repo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.domainRoles', 'dr')
      .leftJoinAndSelect('s.specialties', 'sp')
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
      domainRoleNames: sortByName(entity.domainRoles).map(r => r.name),
      specialtyNames: sortByName(entity.specialties).map(sp => sp.name),
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

  /**
   * Fija la contraseña y activa la cuenta. En UNA transacción (N11):
   *  - revoca todas las sesiones (refresh tokens) del alumno: si alguien tenía la sesión robada,
   *    cambiar la contraseña la corta;
   *  - invalida los demás links de setup/reset pendientes.
   */
  async setPassword(studentId: string, hashedPassword: string): Promise<void> {
    await this.repo.manager.transaction(async manager => {
      const entity = await manager.findOne(StudentEntity, { where: { id: studentId } });
      if (!entity) throw new NotFoundException(`Alumno con id ${studentId} no encontrado.`);
      if (entity.account_status === AccountStatus.Suspended) {
        throw new UnauthorizedException('La cuenta está suspendida.');
      }
      // update() en vez de save(): evita el problema de las relaciones eager (ver X1).
      await manager.update(StudentEntity, { id: studentId }, {
        password: hashedPassword,
        account_status: AccountStatus.Active,
      });
      await this.refreshTokenService.revokeAllForSub(studentId, manager);
      await this.passwordResetTokenService.invalidateAllForStudent(studentId, manager);
    });
  }
}
