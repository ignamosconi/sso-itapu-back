import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
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
  let adminExists: jest.Mock;

  beforeEach(() => {
    mockJwtService = { verifyAsync: jest.fn() };
    adminExists = jest.fn().mockResolvedValue(true);
    const dataSource = { getRepository: () => ({ exists: adminExists }) };
    guard = new AdminJwtGuard(
      mockJwtService as unknown as JwtService,
      { getOrThrow: () => 'admin-access-secret' } as unknown as ConfigService,
      dataSource as unknown as DataSource,
    );
  });

  it('X3: rechaza un token válido de un admin que ya no existe', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 'admin-borrado', username: 'x', type: 'access' });
    adminExists.mockResolvedValue(false);

    await expect(guard.canActivate(makeContext('Bearer valid-admin-token'))).rejects.toThrow(UnauthorizedException);
    expect(adminExists).toHaveBeenCalledWith({ where: { id: 'admin-borrado' } });
  });

  it('P7: verifica solo con HS256', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 'a', type: 'access' });
    await guard.canActivate(makeContext('Bearer t'));
    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('t', expect.objectContaining({ algorithms: ['HS256'] }));
  });

  it('debería retornar true y poblar request.admin con un token de admin válido', async () => {
    const payload = { sub: 'admin-uuid', username: 'admin', type: 'access' };
    mockJwtService.verifyAsync.mockResolvedValue(payload);

    const ctx = makeContext('Bearer valid-admin-token');
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const req = ctx.switchToHttp().getRequest();
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
      { getRepository: () => ({ exists: jest.fn().mockResolvedValue(true) }) } as unknown as DataSource,
    );
    mockJwtService.verifyAsync.mockResolvedValue({ sub: 'admin-uuid', type: 'access' });

    await guardWithSpy.canActivate(makeContext('Bearer token'));

    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('JWT_ADMIN_ACCESS_SECRET');
  });
});