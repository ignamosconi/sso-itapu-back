import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, UnauthorizedException, Inject,
  HttpException, HttpStatus, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { button, callout, emailLayout, note, p } from '../../../mail/utils/email-layout.js';
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

  // ── Search helpers ──────────────────────────────────────────────────────────
  
  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
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
    const email = this.normalizeEmail(dto.email);
    const emailExists = await this.repo
      .createQueryBuilder('s').select('s.id').where('LOWER(s.email) = :email', { email }).getOne();
    if (emailExists) throw new ConflictException(`El email "${email}" ya está registrado.`);

    const domainRole = await this.domainRoleRepo.findOne({ where: { id: dto.domain_role_id } });
    if (!domainRole) throw new NotFoundException(`Cargo con id ${dto.domain_role_id} no encontrado.`);
    const specialty = await this.specialtyRepo.findOne({ where: { id: dto.specialty_id } });
    if (!specialty) throw new NotFoundException(`Especialidad con id ${dto.specialty_id} no encontrada.`);

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
      domainRoleId: dto.domain_role_id,
      specialtyId: dto.specialty_id,
      account_status: AccountStatus.PendingRegistration,
    });

    const saved = await this.repo.save(entity);
    // Recargar con relaciones para el DTO
    const full = await this.repo.findOne({ where: { id: saved.id } }) as StudentEntity;

    // Enviar email de bienvenida de forma asíncrona (no bloqueamos la respuesta)
    this.sendWelcomeEmailSafe(full);

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
      if (!role) throw new NotFoundException(`Cargo con id ${dto.domain_role_id} no encontrado.`);
      // Con relación eager, TypeORM prioriza el objeto de la relación sobre la columna FK: hay que asignar ambos.
      entity.domainRole = role;
      entity.domainRoleId = role.id;
    }
    if (dto.specialty_id) {
      const spec = await this.specialtyRepo.findOne({ where: { id: dto.specialty_id } });
      if (!spec) throw new NotFoundException(`Especialidad con id ${dto.specialty_id} no encontrada.`);
      entity.specialty = spec;
      entity.specialtyId = spec.id;
    }

    return this.toDto(await this.repo.save(entity));
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
  async generateExampleXlsx(): Promise<Buffer> {
    const roles = await this.domainRoleRepo.find({ order: { name: 'ASC' } });
    const specs = await this.specialtyRepo.find({ order: { name: 'ASC' } });

    const headers = ['Nombre/s', 'Apellido/s', 'DNI', 'Email', 'Fecha de nacimiento', 'Cargo', 'Especialidad'];

    const exampleRows = [
      [
        'Ignacio Mariano', 'Mosconi', 44244136, 'alumno@gmail.com',
        new Date(2003, 4, 15),
        roles[0]?.name ?? 'Alumno',
        specs[0]?.name ?? 'Mecánica',
      ],
      [
        'Ana', 'Pérez', 33456789, 'ana@ejemplo.com',
        new Date(1998, 10, 22),
        roles[1]?.name ?? roles[0]?.name ?? 'Profesor',
        specs[1]?.name ?? specs[0]?.name ?? 'Mecánica',
      ],
    ];

    // Construir la grilla principal (columnas A-G)
    const data: unknown[][] = [headers, ...exampleRows];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Formato de fecha DD/MM/YYYY en columna E (índice 4)
    [1, 2].forEach(rowIdx => {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: 4 });
      const cell = ws[cellRef] as XLSX.CellObject | undefined;
      if (cell) cell.z = 'DD/MM/YYYY';
    });

    // Columnas de referencia en I (8) y J (9) — fila 0 = encabezado
    const refColCargo = 8;   // columna I
    const refColSpec  = 9;   // columna J

    const setCellValue = (r: number, c: number, v: string, bold = false) => {
      const ref = XLSX.utils.encode_cell({ r, c });
      ws[ref] = { t: 's', v, s: bold ? { font: { bold: true } } : {} };
      // Actualizar rango
      const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
      if (c > range.e.c) range.e.c = c;
      if (r > range.e.r) range.e.r = r;
      ws['!ref'] = XLSX.utils.encode_range(range);
    };

    setCellValue(0, refColCargo, 'Cargos válidos', true);
    setCellValue(0, refColSpec,  'Especialidades válidas', true);

    const maxRows = Math.max(roles.length, specs.length);
    for (let i = 0; i < maxRows; i++) {
      if (roles[i])  setCellValue(i + 1, refColCargo, roles[i].name);
      if (specs[i])  setCellValue(i + 1, refColSpec,  specs[i].name);
    }

    ws['!cols'] = [
      { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 28 },
      { wch: 22 }, { wch: 20 }, { wch: 20 },
      { wch: 4  },              // columna H vacía
      { wch: 20 }, { wch: 24 }, // I y J
    ];

    // Negrita en encabezados A-G
    headers.forEach((_, c) => {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      const cell = ws[ref] as (XLSX.CellObject & { s?: unknown }) | undefined;
      if (cell) cell.s = { font: { bold: true } };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true }));
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
      const domainRole = this.cellToString(row['domain_role']);
      const specialty = this.cellToString(row['specialty']);

      const birthDate = this.parseBirthDate(row['birth_date']);

      if (!nameRegex.test(firstName)) errors.push('Nombre/s: solo letras y espacios.');
      if (!nameRegex.test(lastName)) errors.push('Apellido/s: solo letras y espacios.');

      const dni = typeof dniRaw === 'number' ? dniRaw : parseInt(String(dniRaw), 10);
      if (isNaN(dni) || dni < 1000000) errors.push('DNI: debe ser un número de al menos 7 dígitos.');

      if (!emailRegex.test(email)) errors.push('Email: formato inválido.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) errors.push('Fecha de nacimiento: usá formato DD/MM/AAAA o formato fecha de Excel. No uses guiones ni texto.');
      if (!roleMap.has(domainRole.toLowerCase())) errors.push(`Cargo: "${domainRole}" no existe en el sistema.`);
      if (!specMap.has(specialty.toLowerCase())) errors.push(`Especialidad: "${specialty}" no existe en el sistema.`);

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

      const role = roleMap.get(domainRole.toLowerCase());
      const spec = specMap.get(specialty.toLowerCase());

      result.push({
        rowNumber: i + 1,
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        data: errors.length === 0
          ? { first_name: firstName, last_name: lastName, dni, email: emailNorm, birth_date: birthDate, domainRoleId: role!.id, specialtyId: spec!.id }
          : { first_name: firstName, last_name: lastName, dni: dniRaw, email, birth_date: birthDate, domain_role: domainRole, specialty },
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
        domainRoleId: row.domainRoleId,
        specialtyId: row.specialtyId,
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
