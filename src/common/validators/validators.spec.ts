import { redirectUriProblem, IsRedirectUri } from './is-redirect-uri.validator.js';
import { ParseDbIdPipe } from '../pipes/parse-db-id.pipe.js';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { IsDbIntString } from './is-db-int.validator.js';
import { IsMaxBytes } from './max-bytes.validator.js';

describe('redirectUriProblem (N8)', () => {
  it.each([
    'https://app.example.com/cb',
    'https://app.example.com:8443/oauth/callback?x=1',
    'http://localhost:4000/callback',
    'http://127.0.0.1:3000/cb',
    'http://[::1]:3000/cb',
  ])('acepta %s', (uri) => expect(redirectUriProblem(uri)).toBeNull());

  it.each([
    ['http://app.example.com/cb', 'http fuera de loopback'],
    ['http://localhost.evil.com/cb', 'host que empieza con localhost'],
    ['https://user:pass@app.example.com/cb', 'credenciales embebidas'],
    ['https://app.example.com/cb#frag', 'fragmento'],
    ['https://*.example.com/cb', 'comodín'],
    ['javascript:alert(1)', 'esquema javascript'],
    ['ftp://app.example.com/cb', 'esquema ftp'],
    ['https://app.example.com/cb ', 'espacio al final'],
    ['https://app.example.com/' + 'a'.repeat(2100), 'más de 2048 caracteres'],
    ['', 'vacía'],
  ])('rechaza %s (%s)', (uri) => expect(redirectUriProblem(uri)).not.toBeNull());
});

describe('redirectUriProblem en producción (localhost)', () => {
  const prod = { NODE_ENV: 'production' };
  it.each(['http://localhost:4000/cb', 'https://localhost/cb', 'http://127.0.0.1:3000/cb', 'http://[::1]:3000/cb'])(
    'rechaza %s',
    (uri) => expect(redirectUriProblem(uri, prod)).toBe('no puede apuntar a localhost en producción.'),
  );
  it('acepta localhost si ALLOW_LOCALHOST_REDIRECTS=true', () =>
    expect(redirectUriProblem('http://localhost:4000/cb', { ...prod, ALLOW_LOCALHOST_REDIRECTS: 'true' })).toBeNull());
  it('sigue aceptando https de un dominio real', () =>
    expect(redirectUriProblem('https://app.example.com/cb', prod)).toBeNull());
  it('en desarrollo acepta localhost', () =>
    expect(redirectUriProblem('http://localhost:4000/cb', { NODE_ENV: 'development' })).toBeNull());
});

describe('@IsRedirectUri con each: el mensaje dice el motivo real', () => {
  class Dto {
    @IsRedirectUri({ each: true })
    redirectUris!: unknown;
  }
  const messages = async (redirectUris: unknown, env?: string) => {
    const prev = process.env.NODE_ENV;
    if (env) process.env.NODE_ENV = env;
    try {
      const dto = Object.assign(new Dto(), { redirectUris });
      return (await validate(dto)).flatMap(e => Object.values(e.constraints ?? {}));
    } finally {
      process.env.NODE_ENV = prev;
    }
  };

  it('localhost en producción: nombra la URI y el motivo', async () => {
    expect(await messages(['https://ok.example.com/cb', 'http://localhost:3000'], 'production')).toEqual([
      'La redirect URI «http://localhost:3000» no puede apuntar a localhost en producción.',
    ]);
  });
  it('http fuera de localhost', async () => {
    const [msg] = await messages(['http://app.example.com/cb']);
    expect(msg).toContain('debe usar https');
    expect(msg).not.toContain('debe ser un texto');
  });
  it('un valor que no es texto sigue diciendo que debe ser un texto', async () => {
    expect(await messages([123])).toEqual(['La redirect URI debe ser un texto.']);
  });
  it('todas válidas: sin errores', async () => expect(await messages(['https://app.example.com/cb'])).toEqual([]));
});

describe('@IsMaxBytes (bcrypt corta en 72 bytes)', () => {
  class Dto {
    @IsMaxBytes()
    password!: unknown;
  }
  const errors = async (password: unknown) =>
    (await validate(Object.assign(new Dto(), { password }))).flatMap(e => Object.values(e.constraints ?? {}));

  it('acepta exactamente 72 bytes', async () => expect(await errors('a'.repeat(72))).toEqual([]));
  it('rechaza 73 bytes', async () =>
    expect(await errors('a'.repeat(73))).toEqual(['La contraseña no puede superar los 72 bytes (unos 72 caracteres).']));
  it('cuenta bytes y no caracteres: 37 ñ son 74 bytes', async () =>
    expect(await errors('ñ'.repeat(37))).toHaveLength(1));
  it('acepta 36 ñ (72 bytes)', async () => expect(await errors('ñ'.repeat(36))).toEqual([]));
  it('rechaza valores que no son texto', async () => expect(await errors(12345678)).toHaveLength(1));
});

describe('ParseDbIdPipe (N12)', () => {
  const pipe = new ParseDbIdPipe();
  it('acepta ids válidos', () => {
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('2147483647')).toBe(2147483647);
  });
  it.each(['0', '-1', '2147483648', '99999999999999999999', '1.5', 'abc', '01', ''])('rechaza %j', (v) => {
    expect(() => pipe.transform(v)).toThrow(BadRequestException);
  });
});

describe('IsDbIntString (N12)', () => {
  class Dto { @IsDbIntString() client_id!: unknown; }
  const check = async (v: unknown) => (await validate(Object.assign(new Dto(), { client_id: v }))).length === 0;
  it('acepta y rechaza según el rango de integer de Postgres', async () => {
    expect(await check('1')).toBe(true);
    expect(await check('2147483647')).toBe(true);
    expect(await check('2147483648')).toBe(false);
    expect(await check('99999999999')).toBe(false);
    expect(await check('0')).toBe(false);
    expect(await check(5)).toBe(false);
  });
});
