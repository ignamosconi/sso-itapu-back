import {
  Injectable, BadRequestException, UnauthorizedException,
  NotFoundException, Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import type { IAuthService } from './auth.service.interface.js';
import type { ICodeService } from '../../code/services/code.service.interface.js';
import type { IOAuthClientService } from '../../oauth-client/services/oauth-client.service.interface.js';
import type { IRefreshTokenService } from '../../refresh-token/services/refresh-token.service.interface.js';
import type { IStudentService } from '../../student/services/student.service.interface.js';
import type { IPasswordResetTokenService } from '../../password-reset-token/services/password-reset-token.service.interface.js';
import type { IMailService } from 'src/mail/services/mail.service.interface.js';
import { LoginRequestDto } from '../dtos/login-request.dto.js';
import { AuthorizationCodeRequestDto } from '../dtos/authorization-code-request.dto.js';
import { RefreshRequestDto } from '../dtos/refresh-request.dto.js';
import { LogoutRequestDto } from '../dtos/logout-request.dto.js';
import { CheckUsernameRequestDto } from '../dtos/check-username-request.dto.js';
import { CheckUsernameResponseDto } from '../dtos/check-username-response.dto.js';
import { SetPasswordRequestDto } from '../dtos/set-password-request.dto.js';
import { RequestPasswordResetRequestDto } from '../dtos/request-password-reset-request.dto.js';
import { CodeResponseDto } from '../dtos/code-response.dto.js';
import { TokenResponseDto } from '../dtos/token-response.dto.js';
import { UserInfoOauthDto } from '../dtos/user-info-oauth.dto.js';
import { JwtPayloadDto } from '../dtos/jwt-payload.dto.js';

@Injectable()
export class AuthService implements IAuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly sessionMaxDurationMs: number;
  private readonly adminPanelUrl: string;

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
  ) {
    this.accessSecret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN');
    this.refreshExpiresIn = this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');
    this.sessionMaxDurationMs =
      this.parseExpiresIn(this.configService.getOrThrow<string>('JWT_REFRESH_SESSION_MAX_DURATION')) * 1000;
    this.adminPanelUrl = this.configService.getOrThrow<string>('ADMIN_PANEL_URL');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
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

  // ── Validación interna ────────────────────────────────────────────────────

  async validateAndGetUserInfo(loginDto: LoginRequestDto): Promise<UserInfoOauthDto> {
    const student = await this.studentService.findForAuth(loginDto.username);
    if (!student) throw new UnauthorizedException('Credenciales inválidas.');

    if (!student.password) {
      throw new UnauthorizedException(
        'Tu cuenta aún no tiene contraseña configurada. Revisá tu correo electrónico.',
      );
    }
    if (student.account_status === 'suspended') {
      throw new UnauthorizedException('Tu cuenta está suspendida. Contactá a un administrador.');
    }
    if (student.account_status === 'pending_registration') {
      throw new UnauthorizedException(
        'Tu cuenta está pendiente de activación. Revisá tu correo electrónico.',
      );
    }

    const valid = await bcrypt.compare(loginDto.password, student.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas.');

    return {
      sub: student.id,
      nombre: student.first_name,
      apellido: student.last_name,
      legajo: student.username,
      carrera: student.specialtyName,
      email: student.email,
      grupo: student.domainRoleName,
    };
  }

  // ── Nuevos endpoints públicos ─────────────────────────────────────────────

  async checkUsername(dto: CheckUsernameRequestDto): Promise<CheckUsernameResponseDto> {
    const student = await this.studentService.findForAuth(dto.username);
    if (!student) throw new NotFoundException('Usuario no encontrado.');
    if (student.account_status === 'suspended') {
      throw new UnauthorizedException('Tu cuenta está suspendida. Contactá a un administrador.');
    }

    if (!student.password) {
      // Generar y enviar email de setup automáticamente
      const token = await this.passwordResetTokenService.generate(student.id, 'setup');
      const link = `${this.adminPanelUrl}/set-password?token=${token}`;
      void this.mailService.send(
        student.email,
        'Configurá tu contraseña — ITAPU',
        { html:
          `
          <p>Hola <strong>${student.first_name}</strong>,</p>
          <p>Para iniciar sesión necesitás configurar tu contraseña.</p>
          <p>Tu nombre de usuario es: <strong>${student.username}</strong></p>
          <p>Hacé clic aquí (válido por 24 horas):</p>
          <p><a href="${link}">${link}</a></p>
          `,
        }
      );
      return { status: 'no_password', maskedEmail: this.maskEmail(student.email) };
    }

    return { status: 'has_password' };
  }

  async requestPasswordReset(dto: RequestPasswordResetRequestDto): Promise<void> {
    const student = await this.studentService.findForAuth(dto.username);
    if (!student) throw new NotFoundException('Usuario no encontrado.');
    if (student.account_status === 'suspended') {
      throw new UnauthorizedException('Tu cuenta está suspendida. Contactá a un administrador.');
    }
    if (!student.password) {
      throw new BadRequestException(
        'Esta cuenta no tiene contraseña configurada. Revisá tu correo de bienvenida.',
      );
    }
    await this.studentService.sendPasswordResetEmail(student);
  }

  async setPassword(dto: SetPasswordRequestDto): Promise<void> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden.');
    }
    const { studentId } = await this.passwordResetTokenService.consume(dto.token);
    const hashed = await bcrypt.hash(dto.password, 10);
    await this.studentService.setPassword(studentId, hashed);
  }

  // ── OAuth flow (sin cambios) ───────────────────────────────────────────────

  async issueCode(loginDto: LoginRequestDto): Promise<CodeResponseDto> {
    const clientId = parseInt(loginDto.client_id, 10);
    const client = await this.oauthClientService.findOne(clientId).catch(() => null);
    if (!client) throw new UnauthorizedException('client_id inválido.');
    if (!client.isActive) throw new UnauthorizedException('La aplicación está suspendida.');
    if (!client.redirectUris.includes(loginDto.redirect_uri)) {
      throw new UnauthorizedException('redirect_uri no coincide con las registradas.');
    }
    const userInfo = await this.validateAndGetUserInfo(loginDto);
    const code = this.codeService.generate(userInfo, clientId);
    return { code, state: loginDto.state };
  }

  async exchangeCodeForTokens(dto: AuthorizationCodeRequestDto): Promise<TokenResponseDto> {
    const clientId = parseInt(dto.client_id, 10);
    const valid = await this.oauthClientService.validateClient(clientId, dto.client_secret, dto.redirect_uri);
    if (!valid) throw new UnauthorizedException('client_id, client_secret o redirect_uri inválidos.');
    const entry = this.codeService.consume(dto.code);
    if (!entry) throw new UnauthorizedException('El código es inválido o ya expiró.');
    if (entry.clientId !== clientId) throw new UnauthorizedException('El código no pertenece a este cliente.');

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(
        { ...entry.userInfo, type: 'access' },
        { secret: this.accessSecret, expiresIn: this.accessExpiresIn } as JwtSignOptions,
      ),
      this.jwtService.signAsync(
        { ...entry.userInfo, type: 'refresh', jti: randomUUID() },
        { secret: this.refreshSecret, expiresIn: this.refreshExpiresIn } as JwtSignOptions,
      ),
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

  async refreshTokens(refreshRequestDto: RefreshRequestDto): Promise<TokenResponseDto> {
    let storedPayload: JwtPayloadDto;
    try {
      storedPayload = await this.jwtService.verifyAsync<JwtPayloadDto>(
        refreshRequestDto.refresh_token,
        { secret: this.refreshSecret },
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

    const record = await this.refreshTokenService.consume(refreshRequestDto.refresh_token);

    const userInfo: Omit<JwtPayloadDto, 'type' | 'iat' | 'exp'> = {
      sub: storedPayload.sub,
      nombre: storedPayload.nombre,
      apellido: storedPayload.apellido,
      legajo: storedPayload.legajo,
      carrera: storedPayload.carrera,
      email: storedPayload.email,
      grupo: storedPayload.grupo,
    };

    const inactivityExpiry = new Date(Date.now() + this.parseExpiresIn(this.refreshExpiresIn) * 1000);
    const effectiveExpiry = record.sessionExpiresAt
      ? new Date(Math.min(inactivityExpiry.getTime(), record.sessionExpiresAt.getTime()))
      : inactivityExpiry;
    const newRefreshExpiresInSeconds = Math.floor((effectiveExpiry.getTime() - Date.now()) / 1000);

    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...userInfo, type: 'access' },
        { secret: this.accessSecret, expiresIn: this.accessExpiresIn } as JwtSignOptions,
      ),
      this.jwtService.signAsync(
        { ...userInfo, type: 'refresh', jti: randomUUID() },
        { secret: this.refreshSecret, expiresIn: newRefreshExpiresInSeconds } as JwtSignOptions,
      ),
    ]);

    await this.refreshTokenService.save({
      token: newRefreshToken,
      sub: record.sub,
      type: 'student',
      expiresIn: `${newRefreshExpiresInSeconds}s`,
      familyId: record.familyId,
      sessionExpiresAt: record.sessionExpiresAt,
      clientId: record.clientId ?? undefined,
    });

    return { access_token: newAccessToken, refresh_token: newRefreshToken, token_type: 'Bearer', expires_in: this.parseExpiresIn(this.accessExpiresIn) };
  }

  async logout(dto: LogoutRequestDto): Promise<void> {
    await this.refreshTokenService.revokeFamily(dto.refresh_token);
  }

  getCleanUserInfo(payload: JwtPayloadDto): UserInfoOauthDto {
    return {
      sub: payload.sub, nombre: payload.nombre, apellido: payload.apellido,
      legajo: payload.legajo, carrera: payload.carrera, email: payload.email, grupo: payload.grupo,
    };
  }
}