import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { LoginAttemptsService } from './login-attempts.service.js';

const config = (env: Record<string, string> = {}) => ({ get: (k: string) => env[k] }) as unknown as ConfigService;

describe('LoginAttemptsService (P2)', () => {
  let redis: { get: jest.Mock; ttl: jest.Mock; eval: jest.Mock; del: jest.Mock };
  let service: LoginAttemptsService;

  beforeEach(() => {
    redis = { get: jest.fn(), ttl: jest.fn(), eval: jest.fn(), del: jest.fn() };
    service = new LoginAttemptsService(redis as never, config());
  });

  it('no bloquea con menos de 5 intentos', async () => {
    redis.get.mockResolvedValue('4');
    await expect(service.assertNotLocked('Alicia1')).resolves.toBeUndefined();
  });

  it('bloquea con 429 y retryAfterSeconds al llegar a 5', async () => {
    redis.get.mockResolvedValue('5');
    redis.ttl.mockResolvedValue(600);
    const err = await service.assertNotLocked('alicia1').catch(e => e as HttpException);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(((err as HttpException).getResponse() as { retryAfterSeconds: number }).retryAfterSeconds).toBe(600);
  });

  it('la clave usa el username en minúsculas y sin espacios, en un namespace propio', async () => {
    await service.registerFailure('  AliCia1 ');
    expect(redis.eval.mock.calls[0][2]).toBe('sso:login-attempts:alicia1');
    expect(redis.eval.mock.calls[0][2]).not.toContain('student:password-attempts');
  });

  it('respeta LOGIN_MAX_ATTEMPTS y LOGIN_LOCK_TTL_MS', async () => {
    service = new LoginAttemptsService(redis as never, config({ LOGIN_MAX_ATTEMPTS: '2', LOGIN_LOCK_TTL_MS: '60000' }));
    redis.get.mockResolvedValue('2');
    redis.ttl.mockResolvedValue(-1);
    const err = await service.assertNotLocked('x').catch(e => e as HttpException);
    expect(((err as HttpException).getResponse() as { retryAfterSeconds: number }).retryAfterSeconds).toBe(60);
  });

  it('rechaza configuración inválida al arrancar', () => {
    expect(() => new LoginAttemptsService(redis as never, config({ LOGIN_MAX_ATTEMPTS: 'abc' }))).toThrow(/LOGIN_MAX_ATTEMPTS/);
  });

  it('reset borra el contador', async () => {
    await service.reset('alicia1');
    expect(redis.del).toHaveBeenCalledWith('sso:login-attempts:alicia1');
  });
});
