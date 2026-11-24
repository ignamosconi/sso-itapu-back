jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$2b$10$hashed'),
  hashSync: jest.fn().mockReturnValue('$2b$10$dummyhash'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { StudentCredentialsDto } from '../../student/students/dtos/student-credentials.dto.js';
import { UserInfoOauthDto } from '../dtos/user-info-oauth.dto.js';
import { JwtPayloadDto } from '../dtos/jwt-payload.dto.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStudent(overrides: Partial<StudentCredentialsDto> = {}): StudentCredentialsDto {
  return {
    id: 'student-uuid',
    username: 'immosconi136',
    email: 'alumno@gmail.com',
    first_name: 'Ignacio',
    last_name: 'Mosconi',
    password: '$2b$10$hashedpassword',
    account_status: 'active',
    domainRoleName: 'Alumno',
    specialtyName: 'Mecánica',
    ...overrides,
  };
}

/** Lo que devuelve studentService.findOne (StudentResponseDto), usado al renovar la sesión. */
function makeStudentDto(overrides: Record<string, unknown> = {}) {
  return {
    id: 'student-uuid',
    username: 'immosconi136',
    first_name: 'Ignacio',
    last_name: 'Mosconi',
    email: 'alumno@gmail.com',
    account_status: 'active',
    domainRole: { id: 1, name: 'Alumno' },
    specialty: { id: 1, name: 'Mecánica' },
    ...overrides,
  };
}

const userInfo: UserInfoOauthDto = {
  sub: 'student-uuid',
  nombre: 'Ignacio',
  apellido: 'Mosconi',
  username: 'immosconi136',
  especialidad: 'Mecánica',
  email: 'alumno@gmail.com',
  cargo: 'Alumno',
};

const loginDto = {
  username: 'immosconi136',
  password: 'password123',
  client_id: '1',
  redirect_uri: 'https://app.com/callback',
  state: 'random-state',
};

function makeConfigService(env: Record<string, string> = {}) {
  const required: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '8h',
    JWT_REFRESH_SESSION_MAX_DURATION: '3d',
    ADMIN_PANEL_URL: 'http://localhost:5173',
    SSO_BASE_URL: 'https://sso.itapu.test/',
  };
  return {
    getOrThrow: (key: string) => {
      if (key in required) return required[key];
      throw new Error(`Config key not found: ${key}`);
    },
    get: (key: string) => env[key],
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let mockStudentService: jest.Mocked<Record<string, jest.Mock>>;
  let mockCodeService: jest.Mocked<Record<string, jest.Mock>>;
  let mockOAuthClientService: jest.Mocked<Record<string, jest.Mock>>;
  let mockRefreshTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockPasswordResetTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockMailService: jest.Mocked<Record<string, jest.Mock>>;
  let mockRedis: jest.Mocked<Record<string, jest.Mock>>;
  let mockLoginAttempts: jest.Mocked<Record<string, jest.Mock>>;
  let mockJwtService: jest.Mocked<Partial<JwtService>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockStudentService = {
      findForAuth: jest.fn(),
      findOne: jest.fn(),
      setPassword: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    mockCodeService = {
      generate: jest.fn().mockResolvedValue('generated-code'),
      consume: jest.fn(),
    };
    mockOAuthClientService = {
      findOne: jest.fn(),
      validateClient: jest.fn(),
      authenticateClient: jest.fn().mockResolvedValue(true),
    };
    mockRefreshTokenService = {
      save: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn(),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
    };
    mockPasswordResetTokenService = {
      generate: jest.fn().mockResolvedValue('reset-token'),
      validate: jest.fn(),
      consume: jest.fn(),
    };
    mockMailService = { send: jest.fn().mockResolvedValue(undefined) };
    mockRedis = {
      ttl: jest.fn().mockResolvedValue(-2),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    mockLoginAttempts = {
      assertNotLocked: jest.fn().mockResolvedValue(undefined),
      registerFailure: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };
    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-jwt'),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: 'ICodeService', useValue: mockCodeService },
        { provide: 'IOAuthClientService', useValue: mockOAuthClientService },
        { provide: 'IRefreshTokenService', useValue: mockRefreshTokenService },
        { provide: 'IStudentService', useValue: mockStudentService },
        { provide: 'IPasswordResetTokenService', useValue: mockPasswordResetTokenService },
        { provide: 'IMailService', useValue: mockMailService },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: 'ILoginAttemptsService', useValue: mockLoginAttempts },
        { provide: ConfigService, useValue: makeConfigService() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── validateAndGetUserInfo (P1 / P2) ────────────────────────────────────────

  describe('validateAndGetUserInfo', () => {
    const GENERIC = 'Usuario o contraseña incorrectos.';

    it('retorna userInfo y limpia el contador de intentos si las credenciales son válidas', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateAndGetUserInfo(loginDto);

      expect(result).toEqual(userInfo);
      expect(mockLoginAttempts.reset).toHaveBeenCalledWith('immosconi136');
    });

    it('P2: si la cuenta está bloqueada corta antes de tocar la base o bcrypt', async () => {
      mockLoginAttempts.assertNotLocked.mockRejectedValue(new HttpException('bloqueada', 429));

      await expect(service.validateAndGetUserInfo(loginDto)).rejects.toThrow(HttpException);
      expect(mockStudentService.findForAuth).not.toHaveBeenCalled();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it.each([
      ['usuario inexistente', null, false],
      ['sin contraseña (pendiente)', makeStudent({ password: null, account_status: 'pending_registration' }), false],
      ['contraseña incorrecta', makeStudent(), false],
      ['pendiente aun con "contraseña correcta"', makeStudent({ account_status: 'pending_registration' }), true],
      ['suspendido con contraseña INCORRECTA', makeStudent({ account_status: 'suspended' }), false],
    ])('P1: %s → mensaje genérico y cuenta como intento fallido', async (_n, student, compareResult) => {
      mockStudentService.findForAuth.mockResolvedValue(student);
      (bcrypt.compare as jest.Mock).mockResolvedValue(compareResult);

      await expect(service.validateAndGetUserInfo(loginDto)).rejects.toThrow(GENERIC);
      expect(mockLoginAttempts.registerFailure).toHaveBeenCalledWith('immosconi136');
      expect(mockLoginAttempts.reset).not.toHaveBeenCalled();
    });

    it('P1: hace bcrypt.compare SIEMPRE, también para un usuario inexistente (contra un hash descartable)', async () => {
      mockStudentService.findForAuth.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateAndGetUserInfo(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', '$2b$10$dummyhash');
    });

    it('P1: solo con la contraseña CORRECTA se informa que la cuenta está suspendida (sin sumar intento)', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent({ account_status: 'suspended' }));
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.validateAndGetUserInfo(loginDto)).rejects.toThrow('suspendida');
      expect(mockLoginAttempts.registerFailure).not.toHaveBeenCalled();
    });
  });

  // ── Mails de acceso (P1) ────────────────────────────────────────────────────

  describe.each(['requestPasswordReset', 'resendSetupEmail'] as const)('%s', (method) => {
    const call = (username = 'immosconi136') => service[method]({ username });

    it('cuenta con contraseña → mail de restauración, cooldown por username (SET NX) y 200 uniforme', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());

      const result = await call();
      await flush();

      expect(result).toEqual({ cooldownSeconds: 300 });
      expect(mockRedis.set).toHaveBeenCalledWith('sso:access-mail-cooldown:immosconi136', '1', 'EX', 300, 'NX');
      expect(mockStudentService.sendPasswordResetEmail).toHaveBeenCalledWith(expect.objectContaining({ id: 'student-uuid' }));
    });

    it('cuenta sin contraseña → mail de configuración (token "setup")', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent({ password: null, account_status: 'pending_registration' }));

      const result = await call();
      await flush();

      expect(result).toEqual({ cooldownSeconds: 300 });
      expect(mockPasswordResetTokenService.generate).toHaveBeenCalledWith('student-uuid', 'setup');
      expect(mockMailService.send).toHaveBeenCalledWith('alumno@gmail.com', expect.any(String), expect.anything());
      expect(mockStudentService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['no existe', null],
      ['está suspendida', makeStudent({ account_status: 'suspended' })],
    ])('si la cuenta %s responde IGUAL (200 + cooldown) y no envía nada', async (_n, student) => {
      mockStudentService.findForAuth.mockResolvedValue(student);

      const result = await call('cualquiera');
      await flush();

      expect(result).toEqual({ cooldownSeconds: 300 });
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockMailService.send).not.toHaveBeenCalled();
      expect(mockStudentService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('el cooldown activo responde 429 con retryAfter, exista o no la cuenta', async () => {
      mockRedis.set.mockResolvedValue(null);
      mockRedis.ttl.mockResolvedValue(120);

      const err = await call('noexiste').catch(e => e as HttpException);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as HttpException).getResponse()).toEqual(expect.objectContaining({ retryAfter: 120 }));
      expect(mockStudentService.findForAuth).not.toHaveBeenCalled();
    });

    it('N4: si el SMTP falla no tira ni deja una promesa sin capturar', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent({ password: null, account_status: 'pending_registration' }));
      mockMailService.send.mockRejectedValue(new Error('SMTP caído'));
      const unhandled = jest.fn();
      process.once('unhandledRejection', unhandled);

      await expect(call()).resolves.toEqual({ cooldownSeconds: 300 });
      await flush(); await flush();

      expect(unhandled).not.toHaveBeenCalled();
      process.removeListener('unhandledRejection', unhandled);
    });
  });

  describe('configuración (PASSWORD_RESET_COOLDOWN_MS)', () => {
    const build = (env: Record<string, string>) =>
      new AuthService(
        makeConfigService(env) as never, mockJwtService as never, mockCodeService as never,
        mockOAuthClientService as never, mockRefreshTokenService as never, mockStudentService as never,
        mockPasswordResetTokenService as never, mockMailService as never, mockRedis as never,
        mockLoginAttempts as never,
      );

    it('toma la duración del entorno (ms → segundos, redondeando hacia arriba)', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      const result = await build({ PASSWORD_RESET_COOLDOWN_MS: '60500' }).requestPasswordReset({ username: 'immosconi136' });
      expect(result.cooldownSeconds).toBe(61);
      expect(mockRedis.set).toHaveBeenCalledWith('sso:access-mail-cooldown:immosconi136', '1', 'EX', 61, 'NX');
    });

    it.each([['abc'], ['0'], ['-2'], ['2.5']])('falla al arrancar si el valor es inválido (%s)', (bad) => {
      expect(() => build({ PASSWORD_RESET_COOLDOWN_MS: bad })).toThrow('PASSWORD_RESET_COOLDOWN_MS');
    });
  });

  // ── validatePasswordResetToken ──────────────────────────────────────────────

  describe('validatePasswordResetToken', () => {
    it('completa sin error si el token y la cuenta son válidos', async () => {
      mockPasswordResetTokenService.validate.mockResolvedValue({ studentId: 'student-uuid', purpose: 'reset' });
      mockStudentService.findOne.mockResolvedValue(makeStudentDto());
      await expect(service.validatePasswordResetToken({ token: 'tok' })).resolves.toBeUndefined();
    });

    it('lanza UnauthorizedException si la cuenta está suspendida', async () => {
      mockPasswordResetTokenService.validate.mockResolvedValue({ studentId: 'student-uuid', purpose: 'reset' });
      mockStudentService.findOne.mockResolvedValue(makeStudentDto({ account_status: 'suspended' }));
      await expect(service.validatePasswordResetToken({ token: 'tok' })).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── setPassword (N11 / X7) ──────────────────────────────────────────────────

  describe('setPassword', () => {
    const dto = { token: 'valid-token', password: 'nueva1234', confirmPassword: 'nueva1234' };

    it('lanza BadRequestException si las contraseñas no coinciden', async () => {
      await expect(service.setPassword({ ...dto, confirmPassword: 'distinta' })).rejects.toThrow(BadRequestException);
    });

    it('X7: rechaza contraseñas de más de 72 bytes (bcrypt las truncaría en silencio)', async () => {
      const long = 'ñ'.repeat(37); // 74 bytes en UTF-8, 37 caracteres
      await expect(service.setPassword({ ...dto, password: long, confirmPassword: long })).rejects.toThrow('72');
      expect(mockPasswordResetTokenService.consume).not.toHaveBeenCalled();
    });

    it('establece la contraseña: valida, consume el token y delega en studentService (que revoca sesiones)', async () => {
      mockPasswordResetTokenService.validate.mockResolvedValue({ studentId: 'student-uuid', purpose: 'setup' });
      mockStudentService.findOne.mockResolvedValue(makeStudentDto());
      mockPasswordResetTokenService.consume.mockResolvedValue({ studentId: 'student-uuid', purpose: 'setup' });

      await service.setPassword(dto);

      expect(mockPasswordResetTokenService.consume).toHaveBeenCalledWith('valid-token');
      expect(mockStudentService.setPassword).toHaveBeenCalledWith('student-uuid', '$2b$10$hashed');
    });

    it('N11: si la cuenta está suspendida NO quema el link', async () => {
      mockPasswordResetTokenService.validate.mockResolvedValue({ studentId: 'student-uuid', purpose: 'reset' });
      mockStudentService.findOne.mockResolvedValue(makeStudentDto({ account_status: 'suspended' }));

      await expect(service.setPassword(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockPasswordResetTokenService.consume).not.toHaveBeenCalled();
      expect(mockStudentService.setPassword).not.toHaveBeenCalled();
    });
  });

  // ── issueCode ───────────────────────────────────────────────────────────────

  describe('issueCode', () => {
    const client = { id: 1, isActive: true, redirectUris: ['https://app.com/callback'] };

    it('retorna code y state, y ata el code a la redirect_uri (P8)', async () => {
      mockOAuthClientService.findOne.mockResolvedValue(client);
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.issueCode(loginDto);

      expect(result).toEqual({ code: 'generated-code', state: 'random-state' });
      expect(mockCodeService.generate).toHaveBeenCalledWith(userInfo, 1, 'https://app.com/callback');
    });

    it('lanza UnauthorizedException si el client_id es inválido', async () => {
      mockOAuthClientService.findOne.mockRejectedValue(new Error('no existe'));
      await expect(service.issueCode(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la aplicación está suspendida', async () => {
      mockOAuthClientService.findOne.mockResolvedValue({ ...client, isActive: false });
      await expect(service.issueCode(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si redirect_uri no está registrada, sin probar la contraseña', async () => {
      mockOAuthClientService.findOne.mockResolvedValue({ ...client, redirectUris: ['https://otra.com/cb'] });
      await expect(service.issueCode(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(mockStudentService.findForAuth).not.toHaveBeenCalled();
    });
  });

  // ── exchangeCodeForTokens (P7 / P8) ─────────────────────────────────────────

  describe('exchangeCodeForTokens', () => {
    const dto = { client_id: '1', client_secret: 'secret', code: 'code', redirect_uri: 'https://app.com/callback' };
    const entry = { userInfo, clientId: 1, redirectUri: 'https://app.com/callback' };

    it('retorna access y refresh token firmados con HS256, iss y aud=client_id (P7)', async () => {
      mockOAuthClientService.validateClient.mockResolvedValue(true);
      mockCodeService.consume.mockResolvedValue(entry);

      const result = await service.exchangeCodeForTokens(dto);

      expect(result).toEqual(expect.objectContaining({ access_token: 'signed-jwt', refresh_token: 'signed-jwt', token_type: 'Bearer' }));
      expect(mockJwtService.signAsync).toHaveBeenCalledTimes(2);
      for (const call of (mockJwtService.signAsync as jest.Mock).mock.calls) {
        expect(call[1]).toEqual(expect.objectContaining({
          algorithm: 'HS256',
          issuer: 'https://sso.itapu.test',   // sin la barra final
          audience: '1',
        }));
      }
      expect(mockRefreshTokenService.save).toHaveBeenCalledWith(expect.objectContaining({ clientId: 1, sub: 'student-uuid' }));
    });

    it('lanza UnauthorizedException si las credenciales del cliente son inválidas', async () => {
      mockOAuthClientService.validateClient.mockResolvedValue(false);
      await expect(service.exchangeCodeForTokens(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el code es inválido o expiró', async () => {
      mockOAuthClientService.validateClient.mockResolvedValue(true);
      mockCodeService.consume.mockResolvedValue(null);
      await expect(service.exchangeCodeForTokens(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el code no pertenece al cliente', async () => {
      mockOAuthClientService.validateClient.mockResolvedValue(true);
      mockCodeService.consume.mockResolvedValue({ ...entry, clientId: 99 });
      await expect(service.exchangeCodeForTokens(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('P8: lanza UnauthorizedException si la redirect_uri del canje no es la de emisión del code', async () => {
      // Ambas están registradas para el cliente, pero el code se emitió para otra.
      mockOAuthClientService.validateClient.mockResolvedValue(true);
      mockCodeService.consume.mockResolvedValue({ ...entry, redirectUri: 'https://app.com/otra' });

      await expect(service.exchangeCodeForTokens(dto)).rejects.toThrow('redirect_uri');
      expect(mockJwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  // ── refreshTokens (P3 / P4) ─────────────────────────────────────────────────

  describe('refreshTokens', () => {
    const dto = { refresh_token: 'valid-refresh', client_id: '1', client_secret: 'secret' };
    const refreshPayload = { ...userInfo, type: 'refresh', jti: 'some-jti', aud: '1' };
    const record = { sub: 'student-uuid', familyId: 'family-uuid', sessionExpiresAt: null, clientId: 1 };

    beforeEach(() => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue(refreshPayload);
      mockRefreshTokenService.consume.mockResolvedValue(record);
      mockStudentService.findOne.mockResolvedValue(makeStudentDto());
    });

    it('retorna nuevos tokens (con iss/aud) con un refresh token válido', async () => {
      const result = await service.refreshTokens(dto);

      expect(result).toEqual(expect.objectContaining({ access_token: 'signed-jwt', refresh_token: 'signed-jwt', token_type: 'Bearer' }));
      expect((mockJwtService.signAsync as jest.Mock).mock.calls[0][1]).toEqual(
        expect.objectContaining({ algorithm: 'HS256', issuer: 'https://sso.itapu.test', audience: '1' }),
      );
      expect(mockRefreshTokenService.save).toHaveBeenCalledWith(expect.objectContaining({ familyId: 'family-uuid', clientId: 1 }));
    });

    it('P4: client_id/client_secret inválidos → 401 sin tocar el token', async () => {
      mockOAuthClientService.authenticateClient.mockResolvedValue(false);
      await expect(service.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenService.consume).not.toHaveBeenCalled();
    });

    it('P4: un refresh token emitido para otra app (aud distinto) se rechaza sin consumirlo', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({ ...refreshPayload, aud: '2' });
      await expect(service.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenService.consume).not.toHaveBeenCalled();
    });

    it('P4: si el registro en la base es de otra app, revoca la familia y rechaza', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({ ...refreshPayload, aud: undefined }); // token viejo sin aud
      mockRefreshTokenService.consume.mockResolvedValue({ ...record, clientId: 2 });

      await expect(service.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenService.revokeFamily).toHaveBeenCalledWith('valid-refresh');
    });

    it('P3: usa los datos ACTUALES del alumno, no los que traía el token viejo', async () => {
      mockStudentService.findOne.mockResolvedValue(makeStudentDto({ domainRole: { id: 2, name: 'Profesor' } }));

      await service.refreshTokens(dto);

      const payload = (mockJwtService.signAsync as jest.Mock).mock.calls[0][0];
      expect(payload.cargo).toBe('Profesor');
    });

    it.each([
      ['suspendido', makeStudentDto({ account_status: 'suspended' })],
      ['eliminado', null],
    ])('P3: si el alumno está %s revoca la sesión y responde 401', async (_n, student) => {
      if (student) mockStudentService.findOne.mockResolvedValue(student);
      else mockStudentService.findOne.mockRejectedValue(new Error('no existe'));

      await expect(service.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenService.revokeFamily).toHaveBeenCalledWith('valid-refresh');
      expect(mockRefreshTokenService.save).not.toHaveBeenCalled();
    });

    it('lanza UnauthorizedException si el token expiró', async () => {
      mockJwtService.verifyAsync = jest.fn().mockRejectedValue({ name: 'TokenExpiredError' });
      await expect(service.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el token es inválido', async () => {
      mockJwtService.verifyAsync = jest.fn().mockRejectedValue(new Error('invalid signature'));
      await expect(service.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el token no es de tipo refresh', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({ ...refreshPayload, type: 'access' });
      await expect(service.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('respeta el límite absoluto de sesión al renovar', async () => {
      mockRefreshTokenService.consume.mockResolvedValue({ ...record, sessionExpiresAt: new Date(Date.now() + 30_000) });

      await service.refreshTokens(dto);

      const saved = mockRefreshTokenService.save.mock.calls[0][0] as { expiresIn: string };
      expect(parseInt(saved.expiresIn, 10)).toBeLessThanOrEqual(30);
    });
  });

  // ── logout (P4) ─────────────────────────────────────────────────────────────

  describe('logout', () => {
    const dto = { refresh_token: 'rt', client_id: '3', client_secret: 'secret' };

    it('revoca la familia del refresh token solo para la app autenticada', async () => {
      await service.logout(dto);
      expect(mockRefreshTokenService.revokeFamily).toHaveBeenCalledWith('rt', 3);
    });

    it('con credenciales de app inválidas responde 401 y no revoca nada', async () => {
      mockOAuthClientService.authenticateClient.mockResolvedValue(false);
      await expect(service.logout(dto)).rejects.toThrow(UnauthorizedException);
      expect(mockRefreshTokenService.revokeFamily).not.toHaveBeenCalled();
    });
  });

  // ── getCleanUserInfo ────────────────────────────────────────────────────────

  describe('getCleanUserInfo', () => {
    it('retorna solo los campos públicos del payload', () => {
      const payload = { ...userInfo, type: 'access', iat: 1, exp: 2, iss: 'x', aud: '1' } as JwtPayloadDto;
      const result = service.getCleanUserInfo(payload);
      expect(result).toEqual(userInfo);
      for (const k of ['type', 'iat', 'exp', 'iss', 'aud']) expect(result).not.toHaveProperty(k);
    });
  });
});
