import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtGuard } from './jwt.guard.js';

function makeContext(authHeader?: string) {
  const request: Record<string, unknown> = {
    headers: { authorization: authHeader },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtGuard', () => {
  let guard: JwtGuard;
  let mockJwtService: { verifyAsync: jest.Mock };

  beforeEach(() => {
    mockJwtService = { verifyAsync: jest.fn() };
    guard = new JwtGuard(
      mockJwtService as unknown as JwtService,
      { getOrThrow: () => 'access-secret' } as unknown as ConfigService,
    );
  });

  it('debería retornar true y poblar request.user con un token válido de tipo access', async () => {
    const payload = { sub: 'student-uuid', type: 'access', username: 'immosconi456' };
    mockJwtService.verifyAsync.mockResolvedValue(payload);

    const ctx = makeContext('Bearer valid-token');
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    // Verifica que el payload queda en el request
    const req = ctx.switchToHttp().getRequest();
    expect(req.user).toEqual(payload);
  });

  it('P7: verifica con HS256 fijo y exige el emisor (iss) de este SSO', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 's', type: 'access' });
    await guard.canActivate(makeContext('Bearer valid-token'));
    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(
      'valid-token',
      expect.objectContaining({ algorithms: ['HS256'], issuer: 'access-secret' }), // el mock de config devuelve el mismo string para todo
    );
  });

  it('debería lanzar UnauthorizedException si no hay header Authorization', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('debería lanzar UnauthorizedException si el header no empieza con "Bearer "', async () => {
    await expect(guard.canActivate(makeContext('Basic dXNlcjpwYXNz')))
      .rejects.toThrow(UnauthorizedException);
  });

  it('debería lanzar UnauthorizedException si el token es inválido o está expirado', async () => {
    mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    await expect(guard.canActivate(makeContext('Bearer bad-token')))
      .rejects.toThrow(UnauthorizedException);
  });

  it('debería lanzar UnauthorizedException si el token es de tipo refresh, no access', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 'student-uuid', type: 'refresh' });
    await expect(guard.canActivate(makeContext('Bearer refresh-token')))
      .rejects.toThrow(UnauthorizedException);
  });

  it('debería lanzar UnauthorizedException si el token es de tipo pending-2fa', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 'admin-uuid', type: 'pending-2fa' });
    await expect(guard.canActivate(makeContext('Bearer pending-token')))
      .rejects.toThrow(UnauthorizedException);
  });
});