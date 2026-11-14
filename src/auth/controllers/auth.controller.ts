import { Controller, Post, Get, Body, Res, Inject, UseGuards, HttpCode } from '@nestjs/common';
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
import { JwtGuard } from '../guards/jwt.guard.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { JwtPayloadDto } from '../dtos/jwt-payload.dto.js';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CheckUsernameRequestDto } from '../dtos/check-username-request.dto.js';
import { CheckUsernameResponseDto } from '../dtos/check-username-response.dto.js';
import { SetPasswordRequestDto } from '../dtos/set-password-request.dto.js';
import { RequestPasswordResetRequestDto } from '../dtos/request-password-reset-request.dto.js';
import { ValidateResetTokenRequestDto } from '../dtos/validate-reset-token-request.dto.js';

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
    description: 'Valida las credenciales del alumno contra autogestión y emite un authorization code de un solo uso (TTL definido por CODE_TTL_MS). Este endpoint es llamado por el HTML del popup.',
  })
  @ApiResponse({ status: 201, type: CodeResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas o client_id/redirect_uri incorrectos' })
  @ApiResponse({ status: 400, description: 'Body malformado' })
  @Throttle({ default: { ttl: 60000, limit: 5 } })  // 5 intentos por minuto por IP
  @Post('login')
  async login(@Body() loginDto: LoginRequestDto): Promise<CodeResponseDto> {
    return this.authService.issueCode(loginDto);
  }

  @ApiOperation({
    summary: 'Canjear authorization code por tokens',
    description: 'Endpoint server-to-server. Recibe el code emitido por /login junto con client_id, client_secret y redirect_uri. Devuelve access_token y refresh_token. El code es de un solo uso y se invalida inmediatamente.',
  })
  @ApiResponse({ status: 201, type: TokenResponseDto })
  @ApiResponse({ status: 401, description: 'Code inválido, expirado, o credenciales de cliente incorrectas' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })  // 10 canjes por minuto por IP
  @Post('token')
  async token(@Body() dto: AuthorizationCodeRequestDto): Promise<TokenResponseDto> {
    return this.authService.exchangeCodeForTokens(dto);
  }

  @ApiOperation({
    summary: 'Renovar access token',
    description: 'Recibe un refresh token válido y devuelve un nuevo access token. El refresh token no cambia.',
  })
  @ApiResponse({ status: 201, type: TokenResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token inválido o expirado' })
  @Post('refresh')
  async refresh(@Body() refreshRequestDto: RefreshRequestDto): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(refreshRequestDto);
  }

  @ApiOperation({
    summary: 'Cerrar sesión de alumno',
    description: 'Revoca el refresh token y toda su familia. El access token expira naturalmente (máx. 15m).',
  })
  @ApiResponse({ status: 204, description: 'Sesión cerrada correctamente' })
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
  me(@CurrentUser() user: JwtPayloadDto): UserInfoOauthDto {
    return this.authService.getCleanUserInfo(user);
  }

  @ApiOperation({
    summary: 'Verificar si un usuario tiene contraseña configurada',
    description:
      'Si el usuario no tiene contraseña (pending_registration), envía automáticamente ' +
      'un email de setup y devuelve el email censurado. No revela si el usuario existe o no ' +
      'con el mismo mensaje en caso de suspensión.',
  })
  @ApiResponse({ status: 200, type: CheckUsernameResponseDto })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 401, description: 'Cuenta suspendida' })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('check-username')
  async checkUsername(@Body() dto: CheckUsernameRequestDto): Promise<CheckUsernameResponseDto> {
    return this.authService.checkUsername(dto);
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
    summary: 'Solicitar email de recuperación de contraseña',
    description: 'Envía un link de un solo uso (24hs) al email registrado del usuario.',
  })
  @ApiResponse({ status: 204, description: 'Email enviado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @Throttle({ default: { ttl: 900000, limit: 3 } })
  @HttpCode(204)
  @Post('request-password-reset')
  async requestPasswordReset(@Body() dto: RequestPasswordResetRequestDto): Promise<void> {
    return this.authService.requestPasswordReset(dto);
  }

  @ApiOperation({
    summary: 'Establecer o restablecer contraseña mediante token',
    description: 'Consume el token de un solo uso y actualiza la contraseña. Activa la cuenta si estaba en pending_registration.',
  })
  @ApiResponse({ status: 204, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 400, description: 'Las contraseñas no coinciden, o token inválido/expirado/usado' })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(204)
  @Post('set-password')
  async setPassword(@Body() dto: SetPasswordRequestDto): Promise<void> {
    return this.authService.setPassword(dto);
  }

}