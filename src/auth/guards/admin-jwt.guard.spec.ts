import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminJwtGuard } from './admin-jwt.guard.js';

function makeContext(authHeader?: string) {
  const request: Record<string, unknown> = {
    headers: { authorization: authHeader },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminJwtGuard', () => {
  let guard: AdminJwtGuard;
  let mockJwtService: { verifyAsync: jest.Mock };

  beforeEach(() => {
    mockJwtService = { verifyAsync: jest.fn() };
    guard = new AdminJwtGuard(
      mockJwtService as unknown as JwtService,
      { getOrThrow: () => 'admin-access-secret' } as unknown as ConfigService,
    );
  });

  it('debería retornar true y poblar request.admin con un token de admin válido', async () => {
    const payload = { sub: 'admin-uuid', username: 'admin', type: 'access' };
    mockJwtService.verifyAsync.mockResolvedValue(payload);

    const ctx = makeContext('Bearer valid-admin-token');
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const req = ctx.switchToHttp().getRequest() as Record<string, unknown>;
    expect(req.admin).toEqual(payload);
  });

  it('debería lanzar UnauthorizedException si no hay header Authorization', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('debería lanzar UnauthorizedException si el header no empieza con "Bearer "', async () => {
    await expect(guard.canActivate(makeContext('Token abc')))
      .rejects.toThrow(UnauthorizedException);
  });

  it('debería lanzar UnauthorizedException si el token de admin es inválido', async () => {
    mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));
    await expect(guard.canActivate(makeContext('Bearer bad-token')))
      .rejects.toThrow(UnauthorizedException);
  });

  it('debería lanzar UnauthorizedException si el token de alumno se usa en endpoint de admin', async () => {
    // Un token de alumno (access) no debería poder usarse en endpoints de admin
    // porque fue firmado con JWT_ACCESS_SECRET, no JWT_ADMIN_ACCESS_SECRET.
    // verifyAsync lanzaría porque el secret no coincide.
    mockJwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    await expect(guard.canActivate(makeContext('Bearer student-token')))
      .rejects.toThrow(UnauthorizedException);
  });

  it('debería lanzar UnauthorizedException si el token no es de tipo access', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 'admin-uuid', type: 'refresh' });
    await expect(guard.canActivate(makeContext('Bearer refresh-token')))
      .rejects.toThrow(UnauthorizedException);
  });

  it('debería usar JWT_ADMIN_ACCESS_SECRET, no JWT_ACCESS_SECRET', async () => {
    const mockConfigService = { getOrThrow: jest.fn().mockReturnValue('admin-secret') };
    const guardWithSpy = new AdminJwtGuard(
      mockJwtService as unknown as JwtService,
      mockConfigService as unknown as ConfigService,
    );
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 'admin-uuid', type: 'access' });

    await guardWithSpy.canActivate(makeContext('Bearer token'));

    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('JWT_ADMIN_ACCESS_SECRET');
  });
});