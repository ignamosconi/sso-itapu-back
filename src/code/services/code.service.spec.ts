import { ConfigService } from '@nestjs/config';
import { CodeService } from './code.service.js';
import { UserInfoOauthDto } from '../../auth/dtos/user-info-oauth.dto.js';

const mockUserInfo: UserInfoOauthDto = {
  sub: '123',
  nombre: 'Juan',
  apellido: 'Pérez',
  username: 'immosconi136',
  especialidad: 'Mecánica',
  email: 'alumno@gmail.com',
  cargo: 'Alumno',
};

/** Redis mínimo en memoria: SET ... PX y GETDEL (con expiración simulada). */
function fakeRedis() {
  const store = new Map<string, { v: string; exp: number }>();
  return {
    store,
    set: jest.fn((k: string, v: string, _px: string, ttl: number) => { store.set(k, { v, exp: Date.now() + ttl }); return Promise.resolve('OK'); }),
    getdel: jest.fn((k: string) => {
      const e = store.get(k); store.delete(k);
      return Promise.resolve(e && Date.now() <= e.exp ? e.v : null);
    }),
  };
}

describe('CodeService (Redis)', () => {
  let redis: ReturnType<typeof fakeRedis>;
  let service: CodeService;
  const REDIRECT = 'https://app.example.com/cb';

  beforeEach(() => {
    redis = fakeRedis();
    const config = { getOrThrow: (k: string) => { if (k === 'CODE_TTL_MS') return '120000'; throw new Error(k); } };
    service = new CodeService(config as unknown as ConfigService, redis as never);
  });

  it('genera códigos únicos, no predecibles y con TTL en Redis', async () => {
    const a = await service.generate(mockUserInfo, 1, REDIRECT);
    const b = await service.generate(mockUserInfo, 1, REDIRECT);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(redis.set).toHaveBeenCalledWith(`sso:code:${a}`, expect.any(String), 'PX', 120000);
  });

  it('consume devuelve userInfo, clientId y redirectUri', async () => {
    const code = await service.generate(mockUserInfo, 42, REDIRECT);
    expect(await service.consume(code)).toEqual({ userInfo: mockUserInfo, clientId: 42, redirectUri: REDIRECT });
  });

  it('el código es de un solo uso (P5/atómico)', async () => {
    const code = await service.generate(mockUserInfo, 1, REDIRECT);
    expect(await service.consume(code)).not.toBeNull();
    expect(await service.consume(code)).toBeNull();
  });

  it('devuelve null para un código inexistente', async () => {
    expect(await service.consume('no-existe')).toBeNull();
  });

  it('devuelve null si expiró', async () => {
    const code = await service.generate(mockUserInfo, 1, REDIRECT);
    redis.store.get(`sso:code:${code}`)!.exp = Date.now() - 1;
    expect(await service.consume(code)).toBeNull();
  });

  it('devuelve null (sin tirar) si el valor guardado está corrupto', async () => {
    redis.store.set('sso:code:x', { v: '{no-json', exp: Date.now() + 1000 });
    expect(await service.consume('x')).toBeNull();
  });
});
