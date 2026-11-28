import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { passwordPolicyErrors, passwordPolicyMessage } from './password-policy.validator.js';
import { SetPasswordRequestDto } from '../../auth/dtos/set-password-request.dto.js';
import { CreateAdminDto } from '../../admin/dtos/create-admin.dto.js';
import { UpdateAdminDto } from '../../admin/dtos/update-admin.dto.js';
import { AdminLoginRequestDto } from '../../admin-auth/dtos/admin-login-request.dto.js';
import { DeleteSelfAdminDto } from '../../admin/dtos/delete-self-admin.dto.js';
import { AdminSeeder } from '../../database/seeders/admin.seeder.js';

describe('passwordPolicyErrors', () => {
  it.each(['Itapu#2026', 'Ñandú_2024', 'aB3$aB3$', 'Contraseña Segura 1!', 'Abcdefg1€'])('acepta %j', (p) => {
    expect(passwordPolicyErrors(p)).toEqual([]);
  });

  it('lista TODO lo que falta de una sola vez y en orden', () => {
    expect(passwordPolicyErrors('abc')).toEqual([
      'al menos 8 caracteres',
      'una letra mayúscula',
      'un número',
      'un caracter especial (por ejemplo ! # $ % _ -)',
    ]);
    expect(passwordPolicyErrors('')).toHaveLength(5);
  });

  it.each([
    ['itapu#2026', 'una letra mayúscula'],
    ['ITAPU#2026', 'una letra minúscula'],
    ['Itapu#abcd', 'un número'],
    ['Itapu20266', 'un caracter especial (por ejemplo ! # $ % _ -)'],
    ['Ita#2026', null],
    ['It#20266', null],
    ['Ita#202', 'al menos 8 caracteres'],
  ])('%j → falta %j', (p, missing) => {
    expect(passwordPolicyErrors(p)).toEqual(missing ? [missing] : []);
  });

  it('un espacio no cuenta como caracter especial', () => {
    expect(passwordPolicyErrors('Itapu 2026')).toEqual(['un caracter especial (por ejemplo ! # $ % _ -)']);
  });

  it('cuenta caracteres (no bytes) para el mínimo: 7 letras con tilde no alcanzan', () => {
    expect(passwordPolicyErrors('Áé1#óúñ')).toEqual(['al menos 8 caracteres']);
  });

  it('los caracteres invisibles y las marcas combinantes no cuentan como especial ni para el largo', () => {
    expect(passwordPolicyErrors('Aa1bcdef\u200B')).toEqual(['un caracter especial (por ejemplo ! # $ % _ -)']);
    expect(passwordPolicyErrors('Aa1#\u0301\u0301\u0301\u0301')).toEqual(['al menos 8 caracteres']);
    expect(passwordPolicyErrors('Aa1#\u200B\u200B\u200B\u200B')).toEqual(['al menos 8 caracteres']);
    expect(passwordPolicyErrors('Ñandú_2026'.normalize('NFD'))).toEqual([]); // ñ/ú escritas como letra + tilde combinante
  });

  it('arma un único mensaje legible', () => {
    expect(passwordPolicyMessage(['una letra mayúscula', 'un número'])).toBe(
      'La contraseña no es segura. Le falta: una letra mayúscula, un número.',
    );
  });
});

describe('DTOs que eligen una contraseña nueva exigen la política', () => {
  const messages = async (cls: new () => object, body: object) =>
    (await validate(plainToInstance(cls, body))).flatMap((e) => Object.values(e.constraints ?? {}));

  it('SetPasswordRequestDto (/sso/set-password): un solo mensaje con todo lo que falta', async () => {
    const msgs = await messages(SetPasswordRequestDto, { token: 't', password: 'abcdefgh', confirmPassword: 'abcdefgh' });
    expect(msgs).toEqual(['La contraseña no es segura. Le falta: una letra mayúscula, un número, un caracter especial (por ejemplo ! # $ % _ -).']);
    expect(await messages(SetPasswordRequestDto, { token: 't', password: 'Itapu#2026', confirmPassword: 'Itapu#2026' })).toEqual([]);
  });

  it('CreateAdminDto (alta de admin)', async () => {
    expect(await messages(CreateAdminDto, { username: 'admin_x', password: 'password_segura' })).toEqual([
      'La contraseña no es segura. Le falta: una letra mayúscula, un número.',
    ]);
    expect(await messages(CreateAdminDto, { username: 'admin_x', password: 'Password_Segura1' })).toEqual([]);
  });

  it('CreateAdminDto sigue rechazando más de 72 bytes aunque cumpla la política', async () => {
    const msgs = await messages(CreateAdminDto, { username: 'admin_x', password: 'Aa1#' + 'ñ'.repeat(40) });
    expect(msgs.some((m) => m.includes('72 bytes'))).toBe(true);
  });

  it('UpdateAdminDto (Mi perfil): exige la política solo si se manda una contraseña nueva', async () => {
    expect(await messages(UpdateAdminDto, { password: 'corta', currentPassword: 'x' })).toEqual([
      'La contraseña no es segura. Le falta: al menos 8 caracteres, una letra mayúscula, un número, un caracter especial (por ejemplo ! # $ % _ -).',
    ]);
    expect(await messages(UpdateAdminDto, { password: 'Nueva_Password1', currentPassword: 'vieja-sin-politica' })).toEqual([]);
    expect(await messages(UpdateAdminDto, { username: 'otro_admin', currentPassword: 'vieja-sin-politica' })).toEqual([]);
  });

  it('los campos que solo VERIFICAN una contraseña existente no aplican la política (cuentas anteriores siguen entrando)', async () => {
    expect(await messages(AdminLoginRequestDto, { username: 'admin', password: 'vieja_sin_politica' })).toEqual([]);
    expect(await messages(DeleteSelfAdminDto, { password: 'vieja_sin_politica', confirmationPhrase: 'borrar-mi-cuenta-no-es-reversible' })).toEqual([]);
    expect(await messages(UpdateAdminDto, { username: 'otro_admin', currentPassword: 'abc' })).toEqual([]);
  });
});

describe('AdminSeeder exige la política al crear el primer admin', () => {
  const build = (password: string, existing: object | null = null) => {
    const repo = { findOne: jest.fn().mockResolvedValue(existing), save: jest.fn() };
    const config = {
      get: jest.fn().mockReturnValue('development'),
      getOrThrow: jest.fn((k: string) => (k === 'ADMIN_USERNAME_SEEDER' ? 'admin' : password)),
    };
    return { seeder: new AdminSeeder(repo as never, config as never), repo };
  };

  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('rechaza una contraseña débil y no crea el admin', async () => {
    const { seeder, repo } = build('cambia_esta_password_min_8_caracteres');
    await expect(seeder.seed()).rejects.toThrow('Le falta: una letra mayúscula.');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('crea el admin si la contraseña cumple', async () => {
    const { seeder, repo } = build('Cambia_Esta_Password_1');
    await seeder.seed();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ username: 'admin' }));
  });

  it('rechaza una contraseña de más de 72 bytes aunque cumpla la política', async () => {
    const { seeder, repo } = build('Aa1#' + 'ñ'.repeat(35));
    await expect(seeder.seed()).rejects.toThrow('no puede superar los 72 bytes');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('si el admin ya existe no valida nada (no rompe instalaciones con la contraseña vieja)', async () => {
    const { seeder, repo } = build('debil', { id: '1' });
    await expect(seeder.seed()).resolves.toBeUndefined();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
