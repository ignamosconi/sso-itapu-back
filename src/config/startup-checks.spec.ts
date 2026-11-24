import { assertSecrets, parseTrustProxy } from './startup-checks.js';

const strong = (c: string) => c.repeat(64);
const goodEnv: Record<string, string> = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: strong('a'),
  JWT_REFRESH_SECRET: strong('b'),
  JWT_ADMIN_ACCESS_SECRET: strong('c'),
  JWT_ADMIN_REFRESH_SECRET: strong('d'),
  ADMIN_PASSWORD_SEEDER: 'una-clave-larga-y-unica-123',
  SWAGGER_PASSWORD: 'otra-clave-larga-y-unica-456',
  SWAGGER_USER: 'docs-itapu',
  REDIS_PASSWORD: 'redis-clave-larga-789',
  DB_PASSWORD: 'db-clave-larga-000',
};
const run = (over: Record<string, string> = {}) => assertSecrets(k => ({ ...goodEnv, ...over })[k]);

describe('assertSecrets (X5)', () => {
  it('no valida nada fuera de producción', () => {
    expect(() => assertSecrets(k => ({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'x' })[k])).not.toThrow();
  });

  it('acepta una configuración de producción correcta', () => expect(run).not.toThrow());

  it.each([
    ['JWT_ACCESS_SECRET', 'cambia_este_secret_acceso'],
    ['DB_PASSWORD', 'postgres'],
    ['SWAGGER_USER', 'admin'],
  ])('rechaza el valor por defecto de %s', (key, value) => {
    expect(() => run({ [key]: value })).toThrow('por defecto');
  });

  it('rechaza secretos JWT de menos de 64 caracteres', () => {
    expect(() => run({ JWT_REFRESH_SECRET: 'corto-pero-no-esta-en-la-lista' })).toThrow('64 caracteres');
  });

  it('rechaza secretos JWT repetidos entre alumnos y admins', () => {
    expect(() => run({ JWT_ADMIN_ACCESS_SECRET: strong('a') })).toThrow('distintos');
  });
});

describe('parseTrustProxy (X7)', () => {
  it('usa 1 por defecto', () => {
    expect(parseTrustProxy(undefined)).toBe(1);
    expect(parseTrustProxy('')).toBe(1);
  });
  it.each([['0', 0], ['1', 1], ['2', 2]])('acepta %s', (raw, n) => expect(parseTrustProxy(raw)).toBe(n));
  it.each([['abc'], ['-1'], ['1.5'], ['99'], ['true']])('rechaza %s', raw => expect(() => parseTrustProxy(raw)).toThrow('TRUST_PROXY'));
});
