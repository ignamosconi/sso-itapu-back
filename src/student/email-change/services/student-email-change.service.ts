import {
  Injectable, Inject, NotFoundException, GoneException, BadRequestException,
  ConflictException, ForbiddenException, HttpStatus,
} from '@nestjs/common';
import { button, callout, emailLayout, note, p } from '../../../mail/utils/email-layout.js';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import type { IStudentEmailChangeService } from './student-email-change.service.interface.js';
import type { IPasswordAttemptsService } from '../../password-attempts/services/password-attempts.service.interface.js';
import type { IRefreshTokenService } from '../../../refresh-token/services/refresh-token.service.interface.js';
import type { IPasswordResetTokenService } from '../../../password-reset-token/services/password-reset-token.service.interface.js';
import type { IMailService } from '../../../mail/services/mail.service.interface.js';
import { html } from '../../../mail/utils/email-html.js';
import { StudentEntity, AccountStatus } from '../../students/entities/student.entity.js';
import { EmailChangeRequestEntity } from '../entities/email-change-request.entity.js';
import { RequestEmailChangeDto } from '../dtos/request-email-change.dto.js';

const DEFAULT_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class StudentEmailChangeService implements IStudentEmailChangeService {
  private readonly ttlMs: number;
  private readonly adminPanelUrl: string;

  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepo: Repository<StudentEntity>,
    @InjectRepository(EmailChangeRequestEntity)
    private readonly requestRepo: Repository<EmailChangeRequestEntity>,
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
    this.ttlMs = this.readPositiveInt('EMAIL_CHANGE_TOKEN_TTL_MS', DEFAULT_TOKEN_TTL_MS);
    this.adminPanelUrl = this.configService.getOrThrow<string>('ADMIN_PANEL_URL');
  }

  // Si la variable no está definida se usa el valor por defecto; si está definida pero es
  // inválida, el servidor NO arranca (mismo criterio que los demás límites de seguridad).
  private readPositiveInt(name: string, fallback: number): number {
    const raw = this.configService.get<string>(name);
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`[Config] ${name} debe ser un entero positivo (valor recibido: "${raw}").`);
    }
    return value;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
  }

  private formatDuration(ms: number): string {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    const hours = minutes / 60;
    if (Number.isInteger(hours)) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    return `${minutes} minutos`;
  }

  // Comparación sin distinguir mayúsculas: en la base pueden existir emails cargados con mayúsculas
  // y la restricción UNIQUE de la columna sí las distingue.
  private async emailInUse(email: string, exceptStudentId: string): Promise<boolean> {
    const count = await this.studentRepo
      .createQueryBuilder('s')
      .where('LOWER(s.email) = :email', { email })
      .andWhere('s.id != :id', { id: exceptStudentId })
      .getCount();
    return count > 0;
  }

  // Los avisos no deben romper el flujo principal: si el mail falla, se ignora.
  private async trySend(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.mailService.send(to, subject, { html: body });
    } catch {
      // intencionalmente ignorado
    }
  }

  // ── Paso 1: el admin pide el cambio (con el alumno presente) ───────────────

  async requestEmailChange(studentId: string, dto: RequestEmailChangeDto): Promise<void> {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student) throw new NotFoundException(`Alumno con id ${studentId} no encontrado.`);
    if (student.account_status !== AccountStatus.Active || student.password === null) {
      throw new BadRequestException('Solo se puede cambiar el email de cuentas activas.');
    }

    // Mismo mecanismo que la baja: el intento se registra ANTES de comparar (los intentos en paralelo
    // también cuentan) y el contador es el mismo, así que no se pueden alternar acciones para evadirlo.
    const attempt = await this.passwordAttempts.registerAttempt(studentId);
    const valid = await bcrypt.compare(dto.password, student.password);
    if (!valid) {
      // 403 y no 401: el 401 hace que el panel renueve el token y REPITA el request (gastaría 2 intentos).
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'La contraseña ingresada es incorrecta.',
        attemptsRemaining: attempt.attemptsRemaining,
        retryAfterSeconds: attempt.retryAfterSeconds,
      });
    }
    await this.passwordAttempts.reset(studentId);

    const newEmail = dto.newEmail.trim().toLowerCase();
    if (newEmail === student.email.toLowerCase()) {
      throw new BadRequestException('El nuevo email es igual al actual.');
    }
    if (await this.emailInUse(newEmail, studentId)) {
      throw new ConflictException('Ese email ya está registrado por otro usuario.');
    }

    // Solo el link más reciente es válido.
    await this.requestRepo.delete({ studentId, used: false });

    const plainToken = randomBytes(32).toString('hex');
    const saved = await this.requestRepo.save({
      studentId,
      newEmail,
      tokenHash: this.hash(plainToken),
      expiresAt: new Date(Date.now() + this.ttlMs),
    });

    const link = `${this.adminPanelUrl}/confirm-email?token=${plainToken}`;
    try {
      await this.mailService.send(newEmail, 'Confirmá tu nuevo email — ITAPU', {
        html: emailLayout({
          title: 'Confirmá tu nuevo email',
          body: html`
            ${p(html`Hola <strong>${student.first_name}</strong>,`)}
            ${p(html`Se solicitó cambiar el email de tu cuenta de ITAPU (usuario: <strong>${student.username}</strong>) por esta dirección.`)}
            ${p(html`Para confirmar el cambio hacé clic aquí (el link expira en ${this.formatDuration(this.ttlMs)}):`)}
            ${button('Confirmar nuevo email', link, 'center')}
            ${callout('Al confirmar, se cerrarán todas tus sesiones activas y vas a tener que volver a iniciar sesión.', 'info')}
            ${note('Si no fuiste vos, ignorá este correo: no se hará ningún cambio.')}
          `,
        }),
      });
    } catch {
      // Sin mail no hay forma de confirmar: no dejamos una solicitud huérfana.
      await this.requestRepo.delete({ id: saved.id });
      throw new BadRequestException(
        'No se pudo enviar el correo de confirmación. Verificá el email e intentá de nuevo.',
      );
    }

    // Aviso al email actual para que el dueño real de la cuenta pueda reaccionar.
    void this.trySend(
      student.email,
      'Se solicitó cambiar el email de tu cuenta — ITAPU',
      emailLayout({
        title: 'Se solicitó cambiar el email de tu cuenta',
        body: html`
          ${p(html`Hola <strong>${student.first_name}</strong>,`)}
          ${p(html`Se solicitó cambiar el email de tu cuenta de ITAPU (usuario: <strong>${student.username}</strong>) por <strong>${this.maskEmail(newEmail)}</strong>.`)}
          ${p('El cambio solo se aplica si se confirma desde el link enviado a esa dirección.')}
          ${callout('Si no lo pediste vos, contactá a un administrador.', 'danger')}
        `,
      }),
    );
  }

  // ── Paso 2: el alumno confirma desde el link enviado al email nuevo ─────────

  async confirmEmailChange(token: string): Promise<void> {
    const tokenHash = this.hash(token);

    // Marca el token como usado de forma atómica: solo una request concurrente puede ganar.
    const result = await this.requestRepo
      .createQueryBuilder()
      .update(EmailChangeRequestEntity)
      .set({ used: true })
      .where('"tokenHash" = :tokenHash', { tokenHash })
      .andWhere('used = false')
      .andWhere('"expiresAt" > :now', { now: new Date() })
      .returning('*')
      .execute();

    if (result.affected === 0) {
      const existing = await this.requestRepo.findOne({ where: { tokenHash } });
      if (!existing) throw new NotFoundException('El link no es válido.');
      if (existing.used) throw new GoneException('Este link ya fue utilizado.');
      throw new GoneException('Este link ha expirado.');
    }

    const request = (result.raw as EmailChangeRequestEntity[])[0];

    const student = await this.studentRepo.findOne({ where: { id: request.studentId } });
    if (!student) throw new NotFoundException('La cuenta ya no existe.');
    if (student.account_status !== AccountStatus.Active) {
      throw new BadRequestException('La cuenta no está activa. Contactá a un administrador.');
    }
    // Pudo haber sido tomado por otro alumno entre el pedido y la confirmación.
    if (await this.emailInUse(request.newEmail, student.id)) {
      throw new ConflictException('Ese email ya fue registrado por otro usuario.');
    }

    const oldEmail = student.email;
    try {
      // Todo o nada: cambiar el email, cerrar las sesiones e invalidar los links de restaurar
      // contraseña (que viven en el mail VIEJO y, si ese buzón estaba comprometido, permitirían
      // tomar la cuenta después del cambio).
      //
      // LIMITACIÓN CONOCIDA: los access tokens ya emitidos siguen siendo válidos hasta su
      // vencimiento (JWT_ACCESS_EXPIRES_IN, por defecto 15 minutos) y /sso/me devuelve los datos
      // que viajan en el token, así que las apps pueden ver el email anterior hasta entonces.
      await this.studentRepo.manager.transaction(async (manager) => {
        await manager.update(StudentEntity, { id: student.id }, { email: request.newEmail });
        await this.refreshTokenService.revokeAllForSub(student.id, manager);
        await this.passwordResetTokenService.invalidateAllForStudent(student.id, manager);
      });
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Ese email ya fue registrado por otro usuario.');
      }
      throw err;
    }

    void this.trySend(
      oldEmail,
      'El email de tu cuenta fue cambiado — ITAPU',
      emailLayout({
        title: 'El email de tu cuenta fue cambiado',
        body: html`
          ${p(html`Hola <strong>${student.first_name}</strong>,`)}
          ${p(html`El email de tu cuenta de ITAPU (usuario: <strong>${student.username}</strong>) fue cambiado a <strong>${this.maskEmail(request.newEmail)}</strong>.`)}
          ${p('Por seguridad, cerramos todas tus sesiones activas.')}
          ${callout('Si no fuiste vos, contactá a un administrador de inmediato.', 'danger')}
        `,
      }),
    );
  }

  // Limpieza diaria de solicitudes vencidas.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    await this.requestRepo
      .createQueryBuilder()
      .delete()
      .where('"expiresAt" < :now', { now: new Date() })
      .execute();
  }
}