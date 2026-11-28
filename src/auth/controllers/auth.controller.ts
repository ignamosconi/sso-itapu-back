import { Controller, Post, Get, Body, Res, Inject, UseGuards, HttpCode, HttpException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { join } from 'path';
import { IAuthController } from './auth.controller.interface.js';
import type { IAuthService } from '../services/auth.service.interface.js';
import { LoginRequestDto } from '../dtos/login-request.dto.js';
import { AuthorizationCodeRequestDto } from '../dtos/authorization-code-request.dto.js';
import { RefreshRequestDto } from '../dtos/refresh-request.dto.js';
import { LogoutRequestDto } from '../dtos/logout-request.dto.js';
import { CodeResponseDto } from '../dtos/code-response.dto.js';
import { TokenResponseDto } from '../dtos/token-response.dto.js';
import { UserInfoOauthDto } from '../dtos/user-info-oauth.dto.js';
import { JwtGuard } from '../../common/guards/jwt.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtPayloadDto } from '../dtos/jwt-payload.dto.js';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SetPasswordRequestDto } from '../dtos/set-password-request.dto.js';
import { RequestPasswordResetRequestDto } from '../dtos/request-password-reset-request.dto.js';
import { ValidateResetTokenRequestDto } from '../dtos/validate-reset-token-request.dto.js';
import { ResendSetupEmailRequestDto } from '../dtos/resend-setup-email-request.dto.js';

@ApiTags('SSO — Alumnos')
@Controller(process.env.AUTH_ROUTE_PATH || 'oauth')
export class AuthController implements IAuthController {
  constructor(
    @Inject('IAuthService')
    private readonly authService: IAuthService,
  ) {}

  @ApiExcludeEndpoint()
  @Get('login')
  serveLoginPage(@Res() res: Response): void {
    res.sendFile(join(__dirname, '..', '..', 'public', 'login', 'index.html'));
  }

  @ApiOperation({
    summary: 'Login de alumno',
    description: 'Valida las credenciales del alumno contra la base de datos del SSO y emite un authorization code de un solo uso (TTL definido por CODE_TTL_MS). Este endpoint es llamado por el HTML del popup.',
  })
  @ApiResponse({ status: 201, type: CodeResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas o client_id/redirect_uri incorrectos' })
  @ApiResponse({ status: 400, description: 'Body malformado' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos fallidos para esa cuenta (incluye cabecera Retry-After)' })
  // Por IP el límite es holgado (varios alumnos pueden compartir la IP del instituto);
  // la protección fuerte contra fuerza bruta es el bloqueo por cuenta (LOGIN_MAX_ATTEMPTS).
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Post('login')
  async login(@Body() loginDto: LoginRequestDto, @Res({ passthrough: true }) res: Response): Promise<CodeResponseDto> {
    try {
      return await this.authService.issueCode(loginDto);
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 429) {
        const body = err.getResponse() as { retryAfterSeconds?: number };
        if (body.retryAfterSeconds) res.setHeader('Retry-After', String(body.retryAfterSeconds));
      }
      throw err;
    }
  }

  @ApiOperation({
    summary: 'Canjear authorization code por tokens',
    description: 'Endpoint server-to-server. Recibe el code emitido por /login junto con client_id, client_secret y redirect_uri. Devuelve access_token y refresh_token. El code es de un solo uso y se invalida inmediatamente.',
  })
  @ApiResponse({ status: 201, type: TokenResponseDto })
  @ApiResponse({ status: 401, description: 'Code inválido, expirado, o credenciales de cliente incorrectas' })
  // El límite se cuenta por (client_id + IP) y no solo por IP: ver AppThrottlerGuard.
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @Post('token')
  async token(@Body() dto: AuthorizationCodeRequestDto): Promise<TokenResponseDto> {
    return this.authService.exchangeCodeForTokens(dto);
  }

  @ApiOperation({
    summary: 'Renovar la sesión (rotación de refresh token)',
    description:
      'Endpoint server-to-server. Requiere client_id + client_secret de la app dueña de la sesión y un refresh token válido. ' +
      'Devuelve un nuevo access_token y un nuevo refresh_token (el anterior queda inutilizable). ' +
      'Vuelve a leer al alumno: si está suspendido o fue eliminado, la sesión se revoca y responde 401.',
  })
  @ApiResponse({ status: 201, type: TokenResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales de la app o refresh token inválidos, expirados o de otra app' })
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @Post('refresh')
  async refresh(@Body() refreshRequestDto: RefreshRequestDto): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(refreshRequestDto);
  }

  @ApiOperation({
    summary: 'Cerrar sesión de alumno',
    description: 'Endpoint server-to-server. Requiere client_id + client_secret. Revoca el refresh token y toda su familia (solo si pertenece a esa app). El access token expira naturalmente (máx. 15m).',
  })
  @ApiResponse({ status: 204, description: 'Sesión cerrada correctamente' })
  @ApiResponse({ status: 401, description: 'client_id o client_secret inválidos' })
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @HttpCode(204)
  @Post('logout')
  async logout(@Body() dto: LogoutRequestDto): Promise<void> {
    return this.authService.logout(dto);
  }

  @ApiOperation({
    summary: 'Obtener datos del alumno autenticado',
    description: 'Devuelve los datos del alumno a partir del access token. Requiere Bearer token de alumno.',
  })
  @ApiResponse({ status: 200, type: UserInfoOauthDto })
  @ApiResponse({ status: 401, description: 'Token inválido, expirado o ausente' })
  @ApiBearerAuth('alumno-jwt')
  @UseGuards(JwtGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayloadDto): UserInfoOauthDto & { aud: string } {
    return { ...this.authService.getCleanUserInfo(user), aud: user.aud };
  }

  @ApiOperation({
    summary: 'Validar si un token de configuración/recuperación de contraseña sigue vigente',
    description: 'Verifica que el token exista, no haya sido utilizado, no esté expirado y que la cuenta no esté suspendida ni eliminada, sin consumirlo.',
  })
  @ApiResponse({ status: 204, description: 'Token válido' })
  @ApiResponse({ status: 401, description: 'Cuenta suspendida' })
  @ApiResponse({ status: 404, description: 'Token o alumno no encontrado' })
  @ApiResponse({ status: 410, description: 'Token ya utilizado o expirado' })
  @Throttle({ default: { ttl: 60000, limit: 15 } })
  @HttpCode(204)
  @Post('validate-reset-token')
  async validateResetToken(@Body() dto: ValidateResetTokenRequestDto): Promise<void> {
    return this.authService.validatePasswordResetToken(dto);
  }

  @ApiOperation({
    summary: 'Pedir el correo para configurar u olvidé mi contraseña',
    description:
      'Respuesta uniforme: devuelve 200 + cooldownSeconds exista o no el usuario, para no revelar qué cuentas existen. ' +
      'Si la cuenta existe y no está suspendida se envía un link de un solo uso (24hs): de configuración si todavía no tiene contraseña, ' +
      'de restauración si ya la tiene. El cooldown (PASSWORD_RESET_COOLDOWN_MS) se aplica por nombre de usuario.',
  })
  @ApiResponse({ status: 200, description: 'Solicitud recibida. Devuelve cooldownSeconds.' })
  @ApiResponse({ status: 429, description: 'Cooldown activo, incluye retryAfter en segundos' })
  @Throttle({ default: { ttl: 900000, limit: 3 } })
  @HttpCode(200)
  @Post('request-password-reset')
  async requestPasswordReset(@Body() dto: RequestPasswordResetRequestDto): Promise<{ cooldownSeconds: number }> {
    return this.authService.requestPasswordReset(dto);
  }

  @ApiOperation({
    summary: 'Establecer o restablecer contraseña mediante token',
    description: 'Consume el token de un solo uso y actualiza la contraseña. Activa la cuenta si estaba en pending_registration.',
  })
  @ApiResponse({ status: 204, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 400, description: 'La contraseña no cumple la política (el mensaje lista todo lo que falta), las contraseñas no coinciden, o token inválido/expirado/usado' })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(204)
  @Post('set-password')
  async setPassword(@Body() dto: SetPasswordRequestDto): Promise<void> {
    return this.authService.setPassword(dto);
  }

  @ApiOperation({
    summary: 'Reenviar correo de configuración de contraseña',
    description: 'Mantenido por compatibilidad: se comporta igual que request-password-reset (respuesta uniforme y mismo cooldown).',
  })
  @ApiResponse({ status: 200, description: 'Solicitud recibida. Devuelve cooldownSeconds.' })
  @ApiResponse({ status: 429, description: 'Cooldown activo, incluye retryAfter en segundos' })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('resend-setup-email')
  async resendSetupEmail(@Body() dto: ResendSetupEmailRequestDto): Promise<{ cooldownSeconds: number }> {
    return this.authService.resendSetupEmail(dto);
  }

}