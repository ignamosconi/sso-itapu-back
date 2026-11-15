jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$2b$10$hashed'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException, NotFoundException, BadRequestException,
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

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let mockStudentService: jest.Mocked<Record<string, jest.Mock>>;
  let mockCodeService: jest.Mocked<Record<string, jest.Mock>>;
  let mockOAuthClientService: jest.Mocked<Record<string, jest.Mock>>;
  let mockRefreshTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockPasswordResetTokenService: jest.Mocked<Record<string, jest.Mock>>;
  let mockMailService: jest.Mocked<Record<string, jest.Mock>>;
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
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, string> = {
                JWT_ACCESS_SECRET: 'access-secret',
                JWT_REFRESH_SECRET: 'refresh-secret',
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_EXPIRES_IN: '8h',
                JWT_REFRESH_SESSION_MAX_DURATION: '3d',
                ADMIN_PANEL_URL: 'http://localhost:5173',
              };
              if (key in map) return map[key];
              throw new Error(`Config key not found: ${key}`);
            },
          },
        },
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

    it('debería retornar no_password y enviar email si la cuenta no tiene contraseña', async () => {
      mockStudentService.findForAuth.mockResolvedValue(
        makeStudent({ password: null, account_status: 'pending_registration' }),
      );
      const result = await service.checkUsername({ username: 'immosconi136' });
      expect(result.status).toBe('no_password');
      expect(result.maskedEmail).toBeDefined();
      expect(mockPasswordResetTokenService.generate).toHaveBeenCalledWith('student-uuid', 'setup');
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
