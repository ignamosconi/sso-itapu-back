import { registerDecorator, ValidationOptions } from 'class-validator';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_LENGTH = 2048;

/**
 * Devuelve el motivo por el que una redirect_uri no es aceptable, o null si es válida.
 * La redirect_uri se usa como destino del postMessage del popup (origen exacto), así que se exige:
 * https (http solo para localhost/127.0.0.1/[::1] en desarrollo), sin credenciales embebidas,
 * sin fragmento y sin comodines.
 * En producción (NODE_ENV=production) se rechazan además los hosts de loopback, salvo que
 * ALLOW_LOCALHOST_REDIRECTS=true: un localhost ahí apunta a la máquina de cada usuario, no a una app real.
 */
export function redirectUriProblem(
  value: unknown,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (typeof value !== 'string' || value.length === 0) return 'debe ser un texto.';
  if (value.length > MAX_LENGTH) return `no puede superar ${MAX_LENGTH} caracteres.`;
  // eslint-disable-next-line no-control-regex
  if (value !== value.trim() || /[\s\u0000-\u001f]/.test(value)) return 'no puede tener espacios ni caracteres de control.';
  if (value.includes('*')) return 'no puede contener comodines (*).';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'no es una URL válida.';
  }
  if (url.username || url.password) return 'no puede incluir usuario ni contraseña.';
  if (url.hash || value.includes('#')) return 'no puede incluir fragmento (#).';
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (loopback && env.NODE_ENV === 'production' && env.ALLOW_LOCALHOST_REDIRECTS !== 'true') {
    return 'no puede apuntar a localhost en producción.';
  }
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && loopback) return null;
  return 'debe usar https (http solo está permitido para localhost, 127.0.0.1 o [::1]).';
}

export function IsRedirectUri(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isRedirectUri',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => redirectUriProblem(value) === null,
        // Con { each: true } class-validator pasa acá el array completo, no el elemento: hay que buscar
        // cuál es el inválido para dar el motivo real (antes todo caía en "debe ser un texto").
        defaultMessage: (args) => {
          const value = args?.value as unknown;
          const list = Array.isArray(value) ? (value as unknown[]) : [value];
          for (const item of list) {
            const problem = redirectUriProblem(item);
            if (problem === null) continue;
            const shown = typeof item === 'string' && item.length > 0 ? ` «${item.slice(0, 80)}»` : '';
            return `La redirect URI${shown} ${problem}`;
          }
          return 'La redirect URI es inválida.';
        },
      },
    });
  };
}
