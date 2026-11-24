// Validaciones de arranque. Viven fuera de main.ts para poder testearlas.

export const KNOWN_WEAK_SECRETS = new Set([
  'cambia_este_secret_acceso',
  'cambia_este_secret_refresco',
  'cambia_este_secret_admin_acceso',
  'cambia_este_secret_admin_refresco',
  'cambia_esta_password_min_8_caracteres',
  'cambia_esta_password_swagger',
  'admin',   // SWAGGER_USER por defecto
  'cambia_esta_password_redis',
  'postgres', // DB_PASSWORD por defecto
]);

export const MIN_JWT_SECRET_LENGTH = 64;

type Getter = (key: string) => string | undefined;

/**
 * En producción el servidor NO arranca si:
 *  - algún secreto es un valor por defecto del .env.example (incluida DB_PASSWORD=postgres);
 *  - algún secreto JWT tiene menos de 64 caracteres (X5);
 *  - dos de los cuatro secretos JWT son iguales (un token de alumno no debe valer como token de admin).
 */
export function assertSecrets(get: Getter): void {
  const env = get('NODE_ENV') ?? 'development';
  if (env !== 'production') return;

  const jwtKeys = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_ADMIN_ACCESS_SECRET', 'JWT_ADMIN_REFRESH_SECRET'];
  const jwtSecrets = jwtKeys.map(k => get(k) ?? '');

  const others = ['ADMIN_PASSWORD_SEEDER', 'SWAGGER_PASSWORD', 'SWAGGER_USER', 'REDIS_PASSWORD', 'DB_PASSWORD'].map(k => get(k) ?? '');
  for (const secret of [...jwtSecrets, ...others]) {
    if (KNOWN_WEAK_SECRETS.has(secret)) {
      throw new Error(
        '[Seguridad] Se detectó un secreto por defecto del .env.example en entorno production. ' +
        'Rotá todos los secretos JWT, passwords de seeder, base de datos y credenciales de Swagger antes de desplegar.',
      );
    }
  }

  const short = jwtKeys.filter((_, i) => jwtSecrets[i].length < MIN_JWT_SECRET_LENGTH);
  if (short.length > 0) {
    throw new Error(
      `[Seguridad] En production cada secreto JWT debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres. ` +
      `Revisá: ${short.join(', ')}. Generá uno con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
    );
  }
  if (new Set(jwtSecrets).size !== jwtSecrets.length) {
    throw new Error('[Seguridad] Los 4 secretos JWT (alumnos y admins, acceso y refresco) deben ser distintos entre sí.');
  }
}

/**
 * TRUST_PROXY = cantidad de proxies confiables delante del backend (X7). Por defecto 1 (un proxy inverso,
 * como en el despliegue actual). Con 0 se ignora X-Forwarded-For. Un valor inválido impide arrancar:
 * si está mal, el throttling por IP podría quedar en manos del atacante.
 */
export function parseTrustProxy(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10) {
    throw new Error(`[Config] TRUST_PROXY debe ser un entero entre 0 y 10 (valor recibido: "${raw}").`);
  }
  return n;
}
