jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$2b$10$hashed'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException, NotFoundException, BadRequestException, HttpException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { StudentCredentialsDto } from '../../student/dtos/student-credentials.dto.js';
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
  };
  return {
    getOrThrow: (key: string) => {
      if (key in required) return required[key];
      throw new Error(`Config key not found: ${key}`);
    },
    get: (key: string) => env[key],
  };
}

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
      generate: jest.fn().mockReturnValue('generated-code'),
      consume: jest.fn(),
    };

    mockOAuthClientService = {
      findOne: jest.fn(),
      validateClient: jest.fn(),
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

    mockMailService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    mockRedis = {
      ttl: jest.fn().mockResolvedValue(-2), // -2 = clave inexistente → sin cooldown activo
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
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
        { provide: ConfigService, useValue: makeConfigService() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── validateAndGetUserInfo ──────────────────────────────────────────────────

  describe('validateAndGetUserInfo', () => {
    it('debería retornar userInfo si las credenciales son válidas', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateAndGetUserInfo(loginDto);
      expect(result.sub).toBe('student-uuid');
      expect(result.username).toBe('immosconi136');
      expect(result.cargo).toBe('Alumno');
    });

    it('debería lanzar UnauthorizedException si el alumno no existe', async () => {
      mockStudentService.findForAuth.mockResolvedValue(null);
      await expect(service.validateAndGetUserInfo(loginDto as never))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si la cuenta no tiene contraseña', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent({ password: null }));
      await expect(service.validateAndGetUserInfo(loginDto as never))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si la cuenta está suspendida', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent({ account_status: 'suspended' }));
      await expect(service.validateAndGetUserInfo(loginDto as never))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si la cuenta está en pending_registration', async () => {
      mockStudentService.findForAuth.mockResolvedValue(
        makeStudent({ account_status: 'pending_registration' }),
      );
      await expect(service.validateAndGetUserInfo(loginDto as never))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.validateAndGetUserInfo(loginDto as never))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ── checkUsername ───────────────────────────────────────────────────────────

  describe('checkUsername', () => {
    it('debería retornar has_password si el usuario tiene contraseña configurada', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      const result = await service.checkUsername({ username: 'immosconi136' });
      expect(result.status).toBe('has_password');
      expect(result.maskedEmail).toBeUndefined();
    });

    it('has_password: debería retornar resetCooldownSeconds: 0 si no hay cooldown de reset activo', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      mockRedis.ttl.mockResolvedValue(-2);
      const result = await service.checkUsername({ username: 'immosconi136' });
      expect(result.status).toBe('has_password');
      expect(result.resetCooldownSeconds).toBe(0);
      expect(mockRedis.ttl).toHaveBeenCalledWith('sso:reset-cooldown:student-uuid');
    });

    it('has_password: debería retornar el tiempo restante del cooldown de reset si está activo', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      mockRedis.ttl.mockResolvedValue(120);
      const result = await service.checkUsername({ username: 'immosconi136' });
      expect(result.resetCooldownSeconds).toBe(120);
    });

    it('debería retornar no_password con cooldownSeconds: 0 si no hay cooldown activo', async () => {
      mockStudentService.findForAuth.mockResolvedValue(
        makeStudent({ password: null, account_status: 'pending_registration' }),
      );
      mockRedis.ttl.mockResolvedValue(-2);
      const result = await service.checkUsername({ username: 'immosconi136' });
      expect(result.status).toBe('no_password');
      expect(result.maskedEmail).toBeDefined();
      expect(result.cooldownSeconds).toBe(0);
      expect(mockPasswordResetTokenService.generate).not.toHaveBeenCalled();
    });

    it('debería retornar no_password con cooldownSeconds restante si hay cooldown activo', async () => {
      mockStudentService.findForAuth.mockResolvedValue(
        makeStudent({ password: null, account_status: 'pending_registration' }),
      );
      mockRedis.ttl.mockResolvedValue(180);
      const result = await service.checkUsername({ username: 'immosconi136' });
      expect(result.status).toBe('no_password');
      expect(result.cooldownSeconds).toBe(180);
    });

    it('debería lanzar NotFoundException si el usuario no existe', async () => {
      mockStudentService.findForAuth.mockResolvedValue(null);
      await expect(service.checkUsername({ username: 'noexiste' }))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar UnauthorizedException si la cuenta está suspendida', async () => {
      mockStudentService.findForAuth.mockResolvedValue(
        makeStudent({ account_status: 'suspended' }),
      );
      await expect(service.checkUsername({ username: 'immosconi136' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ── requestPasswordReset ────────────────────────────────────────────────────

  describe('requestPasswordReset', () => {
    it('debería delegar el envío al studentService', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      await service.requestPasswordReset({ username: 'immosconi136' });
      expect(mockStudentService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('debería tomar el cooldown (SET NX), enviar el mail y retornar cooldownSeconds: 300 por defecto', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.requestPasswordReset({ username: 'immosconi136' });

      expect(result).toEqual({ cooldownSeconds: 300 });
      expect(mockRedis.set).toHaveBeenCalledWith('sso:reset-cooldown:student-uuid', '1', 'EX', 300, 'NX');
      expect(mockStudentService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('debería lanzar HttpException 429 con retryAfter si el cooldown está activo, sin enviar el mail', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      mockRedis.set.mockResolvedValue(null); // NX falló: la clave ya existe
      mockRedis.ttl.mockResolvedValue(180);

      let caughtError: unknown;
      try {
        await service.requestPasswordReset({ username: 'immosconi136' });
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(429);
      expect((caughtError as HttpException).getResponse()).toMatchObject({ retryAfter: 180 });
      expect(mockStudentService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('debería liberar el cooldown si el envío del mail falla', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      mockStudentService.sendPasswordResetEmail.mockRejectedValue(new Error('smtp caído'));

      await expect(service.requestPasswordReset({ username: 'immosconi136' })).rejects.toThrow('smtp caído');
      expect(mockRedis.del).toHaveBeenCalledWith('sso:reset-cooldown:student-uuid');
    });

    it('no debería tocar Redis si el usuario no existe, está suspendido o no tiene contraseña', async () => {
      mockStudentService.findForAuth.mockResolvedValueOnce(null);
      await expect(service.requestPasswordReset({ username: 'x' })).rejects.toThrow(NotFoundException);
      mockStudentService.findForAuth.mockResolvedValueOnce(makeStudent({ account_status: 'suspended' }));
      await expect(service.requestPasswordReset({ username: 'x' })).rejects.toThrow(UnauthorizedException);
      mockStudentService.findForAuth.mockResolvedValueOnce(makeStudent({ password: null }));
      await expect(service.requestPasswordReset({ username: 'x' })).rejects.toThrow(BadRequestException);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    describe('configuración (PASSWORD_RESET_COOLDOWN_MS)', () => {
      const build = (env: Record<string, string>) =>
        new AuthService(
          makeConfigService(env) as never, mockJwtService as never, mockCodeService as never,
          mockOAuthClientService as never, mockRefreshTokenService as never, mockStudentService as never,
          mockPasswordResetTokenService as never, mockMailService as never, mockRedis as never,
        );

      it('debería tomar la duración del entorno (ms → segundos, redondeando hacia arriba)', async () => {
        mockStudentService.findForAuth.mockResolvedValue(makeStudent());
        const custom = build({ PASSWORD_RESET_COOLDOWN_MS: '60500' });

        const result = await custom.requestPasswordReset({ username: 'immosconi136' });

        expect(result.cooldownSeconds).toBe(61);
        expect(mockRedis.set).toHaveBeenCalledWith('sso:reset-cooldown:student-uuid', '1', 'EX', 61, 'NX');
      });

      it.each([['abc'], ['0'], ['-2'], ['2.5']])('debería fallar al arrancar si el valor es inválido (%s)', (bad) => {
        expect(() => build({ PASSWORD_RESET_COOLDOWN_MS: bad })).toThrow('PASSWORD_RESET_COOLDOWN_MS');
      });
    });

    it('debería lanzar NotFoundException si el usuario no existe', async () => {
      mockStudentService.findForAuth.mockResolvedValue(null);
      await expect(service.requestPasswordReset({ username: 'noexiste' }))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar UnauthorizedException si la cuenta está suspendida', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent({ account_status: 'suspended' }));
      await expect(service.requestPasswordReset({ username: 'immosconi136' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar BadRequestException si la cuenta no tiene contraseña (pending_registration)', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent({ password: null }));
      await expect(service.requestPasswordReset({ username: 'immosconi136' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── validatePasswordResetToken ──────────────────────────────────────────────

  describe('validatePasswordResetToken', () => {
    it('debería completar sin error si el token y la cuenta son válidos', async () => {
      mockPasswordResetTokenService.validate.mockResolvedValue({
        studentId: 'student-uuid',
        purpose: 'reset',
      });
      mockStudentService.findOne.mockResolvedValue({ account_status: 'active' });

      await expect(service.validatePasswordResetToken({ token: 'valid-token' }))
        .resolves.toBeUndefined();
    });

    it('debería lanzar UnauthorizedException si la cuenta está suspendida', async () => {
      mockPasswordResetTokenService.validate.mockResolvedValue({
        studentId: 'student-uuid',
        purpose: 'reset',
      });
      mockStudentService.findOne.mockResolvedValue({ account_status: 'suspended' });

      await expect(service.validatePasswordResetToken({ token: 'valid-token' }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ── setPassword ─────────────────────────────────────────────────────────────

  describe('setPassword', () => {
    it('debería lanzar BadRequestException si las contraseñas no coinciden', async () => {
      await expect(
        service.setPassword({ token: 'tok', password: 'nueva1234', confirmPassword: 'distinta' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería establecer la contraseña si el token es válido y las contraseñas coinciden', async () => {
      mockPasswordResetTokenService.consume.mockResolvedValue({
        studentId: 'student-uuid',
        purpose: 'setup',
      });

      await service.setPassword({ token: 'valid-token', password: 'nueva1234', confirmPassword: 'nueva1234' });

      expect(mockPasswordResetTokenService.consume).toHaveBeenCalledWith('valid-token');
      expect(mockStudentService.setPassword).toHaveBeenCalledWith('student-uuid', '$2b$10$hashed');
    });
  });

  // ── issueCode ───────────────────────────────────────────────────────────────

  describe('issueCode', () => {
    it('debería retornar code y state si todo es válido', async () => {
      mockOAuthClientService.findOne.mockResolvedValue({
        id: 1,
        isActive: true,
        redirectUris: ['https://app.com/callback'],
      });
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.issueCode(loginDto);
      expect(result.code).toBe('generated-code');
      expect(result.state).toBe('random-state');
    });

    it('debería lanzar UnauthorizedException si el client_id es inválido', async () => {
      mockOAuthClientService.findOne.mockRejectedValue(new Error('not found'));
      await expect(service.issueCode(loginDto as never)).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si la aplicación está suspendida', async () => {
      mockOAuthClientService.findOne.mockResolvedValue({
        id: 1,
        isActive: false,
        redirectUris: ['https://app.com/callback'],
      });
      await expect(service.issueCode(loginDto as never)).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si redirect_uri no está registrado', async () => {
      mockOAuthClientService.findOne.mockResolvedValue({
        id: 1,
        isActive: true,
        redirectUris: ['https://otro.com/callback'],
      });
      await expect(service.issueCode(loginDto as never)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── exchangeCodeForTokens ───────────────────────────────────────────────────

  describe('exchangeCodeForTokens', () => {
    const tokenDto = {
      client_id: '1',
      client_secret: 'plain-secret',
      code: 'valid-code',
      redirect_uri: 'https://app.com/callback',
    };

    it('debería retornar access y refresh token si el code es válido', async () => {
      mockOAuthClientService.validateClient.mockResolvedValue(true);
      mockCodeService.consume.mockReturnValue({ userInfo, clientId: 1 });
      mockRefreshTokenService.save.mockResolvedValue(undefined);

      const result = await service.exchangeCodeForTokens(tokenDto);
      expect(result.access_token).toBe('signed-jwt');
      expect(result.refresh_token).toBe('signed-jwt');
      expect(result.token_type).toBe('Bearer');
    });

    it('debería lanzar UnauthorizedException si las credenciales del cliente son inválidas', async () => {
      mockOAuthClientService.validateClient.mockResolvedValue(false);
      await expect(service.exchangeCodeForTokens(tokenDto as never))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el code es inválido o expiró', async () => {
      mockOAuthClientService.validateClient.mockResolvedValue(true);
      mockCodeService.consume.mockReturnValue(null);
      await expect(service.exchangeCodeForTokens(tokenDto as never))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el code no pertenece al cliente', async () => {
      mockOAuthClientService.validateClient.mockResolvedValue(true);
      mockCodeService.consume.mockReturnValue({ userInfo, clientId: 99 });
      await expect(service.exchangeCodeForTokens(tokenDto as never))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refreshTokens ───────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    const refreshPayload = {
      sub: 'student-uuid',
      nombre: 'Ignacio',
      apellido: 'Mosconi',
      username: 'immosconi136',
      especialidad: 'Mecánica',
      email: 'alumno@gmail.com',
      cargo: 'Alumno',
      type: 'refresh',
      jti: 'some-jti',
    };

    it('debería retornar nuevos tokens con refresh token válido', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue(refreshPayload);
      mockRefreshTokenService.consume.mockResolvedValue({
        sub: 'student-uuid',
        familyId: 'family-uuid',
        sessionExpiresAt: null,
        clientId: 1,
      });

      const result = await service.refreshTokens({ refresh_token: 'valid-refresh' });
      expect(result.access_token).toBe('signed-jwt');
      expect(result.refresh_token).toBe('signed-jwt');
      expect(result.token_type).toBe('Bearer');
    });

    it('debería lanzar UnauthorizedException si el token expiró', async () => {
      mockJwtService.verifyAsync = jest.fn().mockRejectedValue({ name: 'TokenExpiredError' });
      await expect(service.refreshTokens({ refresh_token: 'expired' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el token es inválido', async () => {
      mockJwtService.verifyAsync = jest.fn().mockRejectedValue(new Error('invalid signature'));
      await expect(service.refreshTokens({ refresh_token: 'bad-token' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si el token no es de tipo refresh', async () => {
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue({ ...refreshPayload, type: 'access' });
      await expect(service.refreshTokens({ refresh_token: 'access-token' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería respetar el límite absoluto de sesión al renovar', async () => {
      // sessionExpiresAt en el pasado cercano pero futuro justo → newRefreshExpiresInSeconds mínimo
      const sessionExpiresAt = new Date(Date.now() + 30_000); // 30 segundos desde ahora
      mockJwtService.verifyAsync = jest.fn().mockResolvedValue(refreshPayload);
      mockRefreshTokenService.consume.mockResolvedValue({
        sub: 'student-uuid',
        familyId: 'family-uuid',
        sessionExpiresAt,
        clientId: 1,
      });

      const result = await service.refreshTokens({ refresh_token: 'valid-refresh' });
      expect(result.access_token).toBeDefined();
      expect(mockRefreshTokenService.save).toHaveBeenCalled();
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('debería revocar la familia del refresh token', async () => {
      await service.logout({ refresh_token: 'some-token' });
      expect(mockRefreshTokenService.revokeFamily).toHaveBeenCalledWith('some-token');
    });
  });

  // ── resendSetupEmail ────────────────────────────────────────────────────────
  describe('resendSetupEmail', () => {
    it('debería enviar el mail y retornar cooldownSeconds: 300 si no hay cooldown activo', async () => {
      mockStudentService.findForAuth.mockResolvedValue(
        makeStudent({ password: null, account_status: 'pending_registration' }),
      );
      mockRedis.ttl.mockResolvedValue(-2);

      const result = await service.resendSetupEmail({ username: 'immosconi136' });

      expect(result.cooldownSeconds).toBe(300);
      expect(mockPasswordResetTokenService.generate).toHaveBeenCalledWith('student-uuid', 'setup');
      expect(mockMailService.send).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith('sso:setup-cooldown:student-uuid', '1', 'EX', 300);
    });

    it('debería usar PASSWORD_RESET_COOLDOWN_MS como duración del cooldown de setup', async () => {
      mockStudentService.findForAuth.mockResolvedValue(
        makeStudent({ password: null, account_status: 'pending_registration' }),
      );
      mockRedis.ttl.mockResolvedValue(-2);
      const custom = new AuthService(
        makeConfigService({ PASSWORD_RESET_COOLDOWN_MS: '60500' }) as never, mockJwtService as never,
        mockCodeService as never, mockOAuthClientService as never, mockRefreshTokenService as never,
        mockStudentService as never, mockPasswordResetTokenService as never, mockMailService as never,
        mockRedis as never,
      );

      const result = await custom.resendSetupEmail({ username: 'immosconi136' });

      expect(result.cooldownSeconds).toBe(61);
      expect(mockRedis.set).toHaveBeenCalledWith('sso:setup-cooldown:student-uuid', '1', 'EX', 61);
    });

    it('debería lanzar HttpException 429 con retryAfter si el cooldown está activo', async () => {
      mockStudentService.findForAuth.mockResolvedValue(
        makeStudent({ password: null, account_status: 'pending_registration' }),
      );
      mockRedis.ttl.mockResolvedValue(180);

      let caughtError: unknown;
      try {
        await service.resendSetupEmail({ username: 'immosconi136' });
      } catch (e) {
        caughtError = e;
      }
      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(429);
      expect((caughtError as HttpException).getResponse()).toMatchObject({ retryAfter: 180 });
    });

    it('debería lanzar NotFoundException si el usuario no existe', async () => {
      mockStudentService.findForAuth.mockResolvedValue(null);
      await expect(service.resendSetupEmail({ username: 'noexiste' }))
        .rejects.toThrow(NotFoundException);
    });

    it('debería lanzar UnauthorizedException si la cuenta está suspendida', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent({ account_status: 'suspended' }));
      await expect(service.resendSetupEmail({ username: 'immosconi136' }))
        .rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar BadRequestException si la cuenta ya tiene contraseña configurada', async () => {
      mockStudentService.findForAuth.mockResolvedValue(makeStudent());
      await expect(service.resendSetupEmail({ username: 'immosconi136' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── getCleanUserInfo ────────────────────────────────────────────────────────

  describe('getCleanUserInfo', () => {
    it('debería retornar solo los campos públicos del payload', () => {
      const payload = {
        ...userInfo,
        type: 'access',
        iat: 1234567890,
        exp: 1234568790,
      } as JwtPayloadDto;

      const result = service.getCleanUserInfo(payload);

      expect(result).toEqual(userInfo);
      expect(result).not.toHaveProperty('type');
      expect(result).not.toHaveProperty('iat');
      expect(result).not.toHaveProperty('exp');
    });
  });
});
