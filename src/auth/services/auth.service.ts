import {
  Injectable, BadRequestException, UnauthorizedException, HttpException,
  Inject, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { IAuthService } from './auth.service.interface.js';
import type { ICodeService } from '../../code/services/code.service.interface.js';
import type { IOAuthClientService } from '../../oauth-client/services/oauth-client.service.interface.js';
import type { IRefreshTokenService } from '../../refresh-token/services/refresh-token.service.interface.js';
import type { IStudentService } from '../../student/students/services/student.service.interface.js';
import type { ILoginAttemptsService } from './login-attempts.service.interface.js';
import type { IPasswordResetTokenService } from '../../password-reset-token/services/password-reset-token.service.interface.js';
import type { IMailService } from '../../mail/services/mail.service.interface.js';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import type { StudentCredentialsDto } from '../../student/students/dtos/student-credentials.dto.js';
import { ResendSetupEmailRequestDto } from '../dtos/resend-setup-email-request.dto.js';
import { LoginRequestDto } from '../dtos/login-request.dto.js';
import { AuthorizationCodeRequestDto } from '../dtos/authorization-code-request.dto.js';
import { RefreshRequestDto } from '../dtos/refresh-request.dto.js';
import { LogoutRequestDto } from '../dtos/logout-request.dto.js';
import { SetPasswordRequestDto } from '../dtos/set-password-request.dto.js';
import { RequestPasswordResetRequestDto } from '../dtos/request-password-reset-request.dto.js';
import { CodeResponseDto } from '../dtos/code-response.dto.js';
import { TokenResponseDto } from '../dtos/token-response.dto.js';
import { UserInfoOauthDto } from '../dtos/user-info-oauth.dto.js';
import { JwtPayloadDto } from '../dtos/jwt-payload.dto.js';
import { ValidateResetTokenRequestDto } from '../dtos/validate-reset-token-request.dto.js';
import { html } from '../../mail/utils/email-html.js';
import { button, callout, emailLayout, note, p } from '../../mail/utils/email-layout.js';

const DEFAULT_RESET_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly sessionMaxDurationMs: number;
  private readonly adminPanelUrl: string;
  private readonly resetCooldownSeconds: number;
  private readonly issuer: string;
  // Hash descartable para comparar siempre contra bcrypt aunque la cuenta no exista (evita filtrar existencia por tiempo de respuesta).
  private readonly dummyHash = bcrypt.hashSync('dummy-password-never-valid', 10);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject('ICodeService')
    private readonly codeService: ICodeService,
    @Inject('IOAuthClientService')
    private readonly oauthClientService: IOAuthClientService,
    @Inject('IRefreshTokenService')
    private readonly refreshTokenService: IRefreshTokenService,
    @Inject('IStudentService')
    private readonly studentService: IStudentService,
    @Inject('IPasswordResetTokenService')
    private readonly passwordResetTokenService: IPasswordResetTokenService,
    @Inject('IMailService')
    private readonly mailService: IMailService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @Inject('ILoginAttemptsService')
    private readonly loginAttempts: ILoginAttemptsService,
  ) {
    this.accessSecret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN');
    this.refreshExpiresIn = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');
    this.sessionMaxDurationMs =
      this.parseExpiresIn(this.configService.getOrThrow<string>('JWT_REFRESH_SESSION_MAX_DURATION')) * 1000;
    this.adminPanelUrl = this.configService.getOrThrow<string>('ADMIN_PANEL_URL');
    this.issuer = this.configService.getOrThrow<string>('SSO_BASE_URL').replace(/\/+$/, '');
    this.resetCooldownSeconds = Math.ceil(
      this.readPositiveInt('PASSWORD_RESET_COOLDOWN_MS', DEFAULT_RESET_COOLDOWN_MS) / 1000,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Si la variable no está definida se usa el valor por defecto; si está definida pero es
  // inválida, el servidor NO arranca (igual que los demás límites de seguridad).
  private readPositiveInt(name: string, fallback: number): number {
    const raw = this.configService.get<string>(name);
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`[Config] ${name} debe ser un entero positivo (valor recibido: "${raw}").`);
    }
    return value;
  }

  private parseExpiresIn(value: string): number {
    const unit = value.slice(-1);
    const amount = parseInt(value.slice(0, -1), 10);
    switch (unit) {
      case 's': return amount;
      case 'm': return amount * 60;
      case 'h': return amount * 60 * 60;
      case 'd': return amount * 60 * 60 * 24;
      default:  return parseInt(value, 10);
    }
  }

  // ── Firma de tokens ───────────────────────────────────────────────────────

  // HS256 fijo, con emisor (iss) = este SSO y audiencia (aud) = client_id de la app (P7).
  private signToken(
    payload: Record<string, unknown>,
    secret: string,
    expiresIn: string | number,
    clientId: number,
  ): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
      algorithm: 'HS256',
      issuer: this.issuer,
      audience: String(clientId),
    } as JwtSignOptions);
  }

  // ── Validación interna ────────────────────────────────────────────────────

  /**
   * Login uniforme (P1/P2):
   *  - Primero se chequea el bloqueo por cuenta.
   *  - SIEMPRE se hace un bcrypt.compare (contra un hash descartable si la cuenta no existe o no tiene contraseña),
   *    para que usuario inexistente, sin contraseña, pendiente o contraseña incorrecta sean indistinguibles
   *    por mensaje y por tiempo.
   *  - El mensaje específico de "cuenta suspendida" solo se muestra con la contraseña correcta.
   */
  async validateAndGetUserInfo(loginDto: LoginRequestDto): Promise<UserInfoOauthDto> {
    await this.loginAttempts.assertNotLocked(loginDto.username);

    const student = await this.studentService.findForAuth(loginDto.username);
    const valid = await bcrypt.compare(loginDto.password, student?.password ?? this.dummyHash);

    if (!student || !student.password || !valid) {
      await this.loginAttempts.registerFailure(loginDto.username);
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }
    if (student.account_status === 'suspended') {
      // La contraseña es correcta: el dueño de la cuenta puede saber que está suspendida.
      throw new UnauthorizedException('Tu cuenta está suspendida. Contactá a un administrador.');
    }
    if (student.account_status !== 'active') {
      await this.loginAttempts.registerFailure(loginDto.username);
      throw new UnauthorizedException('Usuario o contraseña incorrectos.');
    }

    await this.loginAttempts.reset(loginDto.username);
    return {
      sub: student.id,
      nombre: student.first_name,
      apellido: student.last_name,
      username: student.username,
      especialidad: student.specialtyName,
      email: student.email,
      cargo: student.domainRoleName,
    };
  }

  // ── Mails de acceso (setup / reset) ───────────────────────────────────────

  private sendSetupEmail(student: StudentCredentialsDto): Promise<void> {
    return (async () => {
      const token = await this.passwordResetTokenService.generate(student.id, 'setup');
      const link = `${this.adminPanelUrl}/set-password?token=${token}`;
      await this.mailService.send(student.email, 'Configurá tu contraseña — ITAPU', {
        html: emailLayout({
          title: 'Configurá tu contraseña',
          body: html`
            ${p(html`Hola <strong>${student.first_name}</strong>,`)}
            ${p('Para iniciar sesión necesitás configurar tu contraseña.')}
            ${callout(html`Tu nombre de usuario es: <strong>${student.username}</strong>`)}
            ${p('Hacé clic aquí (válido por 24 horas):')}
            ${button('Configurar contraseña', link, 'center')}
            ${note('Si no pediste este correo, ignoralo.')}
          `,
        }),
      });
    })();
  }

  /**
   * Respuesta uniforme (P1): exista o no la cuenta, esté pendiente, activa o suspendida, el cliente recibe
   * lo mismo (200 + cooldown, o 429 si pidió hace poco). El mail solo se envía si la cuenta existe y no está
   * suspendida: sin contraseña → mail de configuración; con contraseña → mail de restauración.
   * El cooldown se indexa por username normalizado, no por id, para que tampoco filtre existencia.
   */
  private async sendAccessEmail(username: string): Promise<{ cooldownSeconds: number }> {
    // SET NX es atómico: si dos pedidos llegan a la vez, solo uno toma el cooldown.
    const cooldownKey = `sso:access-mail-cooldown:${username.trim().toLowerCase()}`;
    const acquired = await this.redis.set(cooldownKey, '1', 'EX', this.resetCooldownSeconds, 'NX');
    if (acquired === null) {
      const ttl = await this.redis.ttl(cooldownKey);
      throw new HttpException(
        { message: 'Esperá antes de reenviar el correo.', retryAfter: ttl > 0 ? ttl : this.resetCooldownSeconds },
        429,
      );
    }

    const student = await this.studentService.findForAuth(username);
    if (student && student.account_status !== 'suspended') {
      // Segundo plano: no demora la respuesta (mismo tiempo exista o no) y un fallo de SMTP solo se registra.
      const sending = student.password
        ? this.studentService.sendPasswordResetEmail(student)
        : this.sendSetupEmail(student);
      sending.catch((err: unknown) =>
        this.logger.error(`No se pudo enviar el mail de acceso: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
    return { cooldownSeconds: this.resetCooldownSeconds };
  }

  async resendSetupEmail(dto: ResendSetupEmailRequestDto): Promise<{ cooldownSeconds: number }> {
    return this.sendAccessEmail(dto.username);
  }

  async requestPasswordReset(dto: RequestPasswordResetRequestDto): Promise<{ cooldownSeconds: number }> {
    return this.sendAccessEmail(dto.username);
  }

  async validatePasswordResetToken(dto: ValidateResetTokenRequestDto): Promise<void> {
    const { studentId } = await this.passwordResetTokenService.validate(dto.token);
    const student = await this.studentService.findOne(studentId);
    if (student.account_status === 'suspended') {
      throw new UnauthorizedException('La cuenta está suspendida.');
    }
  }

  async setPassword(dto: SetPasswordRequestDto): Promise<void> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden.');
    }
    // bcrypt ignora todo lo que pase de 72 bytes: se rechaza en vez de truncar en silencio (X7).
    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException('La contraseña no puede superar los 72 bytes (unos 72 caracteres).');
    }
    // 1) Validar sin consumir: si la cuenta está suspendida el link no se quema.
    const { studentId } = await this.passwordResetTokenService.validate(dto.token);
    const student = await this.studentService.findOne(studentId);
    if (student.account_status === 'suspended') {
      throw new UnauthorizedException('La cuenta está suspendida.');
    }
    // 2) Consumir (atómico, un solo uso) y 3) guardar. studentService.setPassword revoca sesiones
    //    e invalida los demás links en la misma transacción (N11).
    const consumed = await this.passwordResetTokenService.consume(dto.token);
    const hashed = await bcrypt.hash(dto.password, 10);
    await this.studentService.setPassword(consumed.studentId, hashed);
  }

  // ── OAuth flow ────────────────────────────────────────────────────────────

  async issueCode(loginDto: LoginRequestDto): Promise<CodeResponseDto> {
    const clientId = parseInt(loginDto.client_id, 10);
    const client = await this.oauthClientService.findOne(clientId).catch(() => null);
    if (!client) throw new UnauthorizedException('client_id inválido.');
    if (!client.isActive) throw new UnauthorizedException('La aplicación está suspendida.');
    if (!client.redirectUris.includes(loginDto.redirect_uri)) {
      throw new UnauthorizedException('La URL de redirección en el link no coincide con las registradas. Contactá al desarrollador de la aplicación para que lo resuelva.');
    }
    const userInfo = await this.validateAndGetUserInfo(loginDto);
    // El code queda atado a la redirect_uri con la que se emitió (P8).
    const code = await this.codeService.generate(userInfo, clientId, loginDto.redirect_uri);
    return { code, state: loginDto.state };
  }

  async exchangeCodeForTokens(dto: AuthorizationCodeRequestDto): Promise<TokenResponseDto> {
    const clientId = parseInt(dto.client_id, 10);
    const valid = await this.oauthClientService.validateClient(clientId, dto.client_secret, dto.redirect_uri);
    if (!valid) throw new UnauthorizedException('client_id, client_secret o redirect_uri inválidos.');
    const entry = await this.codeService.consume(dto.code);
    if (!entry) throw new UnauthorizedException('El código es inválido o ya expiró.');
    if (entry.clientId !== clientId) throw new UnauthorizedException('El código no pertenece a este cliente.');
    if (entry.redirectUri !== dto.redirect_uri) {
      throw new UnauthorizedException('La redirect_uri no coincide con la usada al iniciar sesión.');
    }

    const [access_token, refresh_token] = await Promise.all([
      this.signToken({ ...entry.userInfo, type: 'access' }, this.accessSecret, this.accessExpiresIn, clientId),
      this.signToken({ ...entry.userInfo, type: 'refresh', jti: randomUUID() }, this.refreshSecret, this.refreshExpiresIn, clientId),
    ]);

    const sessionExpiresAt = new Date(Date.now() + this.sessionMaxDurationMs);
    await this.refreshTokenService.save({
      token: refresh_token,
      sub: entry.userInfo.sub,
      type: 'student',
      expiresIn: this.refreshExpiresIn,
      sessionExpiresAt,
      clientId,
    });

    return { access_token, refresh_token, token_type: 'Bearer', expires_in: this.parseExpiresIn(this.accessExpiresIn) };
  }

  /**
   * Renovación de sesión. Exige client_id + client_secret de la app dueña de la sesión (P4) y
   * vuelve a leer al alumno de la base (P3): si lo suspendieron o borraron, la sesión se corta
   * y si le cambiaron cargo/especialidad/nombre, el nuevo token ya lo refleja.
   */
  async refreshTokens(dto: RefreshRequestDto): Promise<TokenResponseDto> {
    const clientId = parseInt(dto.client_id, 10);
    if (!(await this.oauthClientService.authenticateClient(clientId, dto.client_secret))) {
      throw new UnauthorizedException('client_id o client_secret inválidos.');
    }

    let storedPayload: JwtPayloadDto & { aud?: string };
    try {
      storedPayload = await this.jwtService.verifyAsync<JwtPayloadDto & { aud?: string }>(
        dto.refresh_token,
        { secret: this.refreshSecret, algorithms: ['HS256'] },
      );
    } catch (err) {
      const jwtErr = err as { name?: string };
      if (jwtErr?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('La sesión expiró. Volvé a iniciar sesión.');
      }
      throw new UnauthorizedException('Refresh token inválido o revocado.');
    }

    if (storedPayload.type !== 'refresh') {
      throw new UnauthorizedException('El token proporcionado no es un refresh token.');
    }
    // Los tokens emitidos antes de agregar `aud` no lo tienen: ahí la verdad es el registro en la base (se chequea abajo).
    if (storedPayload.aud !== undefined && storedPayload.aud !== String(clientId)) {
      throw new UnauthorizedException('El refresh token no pertenece a esta aplicación.');
    }

    const record = await this.refreshTokenService.consume(dto.refresh_token);
    if (record.clientId !== clientId) {
      // Se presentó con las credenciales de otra app: se trata como uso indebido.
      await this.refreshTokenService.revokeFamily(dto.refresh_token);
      throw new UnauthorizedException('El refresh token no pertenece a esta aplicación.');
    }

    // P3: datos frescos. Si el alumno ya no existe o no está activo, la sesión se corta.
    const student = await this.studentService.findOne(record.sub).catch(() => null);
    if (!student || student.account_status !== 'active') {
      await this.refreshTokenService.revokeFamily(dto.refresh_token);
      throw new UnauthorizedException('La sesión ya no es válida. Volvé a iniciar sesión.');
    }
    const userInfo: UserInfoOauthDto = {
      sub: student.id,
      nombre: student.first_name,
      apellido: student.last_name,
      username: student.username,
      especialidad: student.specialty.name,
      email: student.email,
      cargo: student.domainRole.name,
    };

    const inactivityExpiry = new Date(Date.now() + this.parseExpiresIn(this.refreshExpiresIn) * 1000);
    const effectiveExpiry = record.sessionExpiresAt
      ? new Date(Math.min(inactivityExpiry.getTime(), record.sessionExpiresAt.getTime()))
      : inactivityExpiry;
    const newRefreshExpiresInSeconds = Math.floor((effectiveExpiry.getTime() - Date.now()) / 1000);

    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.signToken({ ...userInfo, type: 'access' }, this.accessSecret, this.accessExpiresIn, clientId),
      this.signToken({ ...userInfo, type: 'refresh', jti: randomUUID() }, this.refreshSecret, newRefreshExpiresInSeconds, clientId),
    ]);

    await this.refreshTokenService.save({
      token: newRefreshToken,
      sub: record.sub,
      type: 'student',
      expiresIn: `${newRefreshExpiresInSeconds}s`,
      familyId: record.familyId,
      sessionExpiresAt: record.sessionExpiresAt,
      clientId,
    });

    return { access_token: newAccessToken, refresh_token: newRefreshToken, token_type: 'Bearer', expires_in: this.parseExpiresIn(this.accessExpiresIn) };
  }

  async logout(dto: LogoutRequestDto): Promise<void> {
    const clientId = parseInt(dto.client_id, 10);
    if (!(await this.oauthClientService.authenticateClient(clientId, dto.client_secret))) {
      throw new UnauthorizedException('client_id o client_secret inválidos.');
    }
    // Solo revoca si la sesión pertenece a esa app.
    await this.refreshTokenService.revokeFamily(dto.refresh_token, clientId);
  }

  getCleanUserInfo(payload: JwtPayloadDto): UserInfoOauthDto {
    return {
      sub: payload.sub,
      nombre: payload.nombre,
      apellido: payload.apellido,
      username: payload.username,
      especialidad: payload.especialidad,
      email: payload.email,
      cargo: payload.cargo,
    };
  }
}