import { registerDecorator, ValidationOptions } from 'class-validator';

/** Largo mínimo de cualquier contraseña nueva (alumnos y admins). */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Requisitos de una contraseña nueva. El orden es el que se muestra en el mensaje de error.
 * Los mismos textos se usan en el front (`src/utils/passwordPolicy.ts`): si cambian acá, cambiarlos allá.
 *
 * - Mayúsculas/minúsculas con `\p{Lu}`/`\p{Ll}` para aceptar Ñ, Á, ñ, á, etc.
 * - "Caracter especial" = cualquier cosa que no sea letra, número ni espacio (`!`, `#`, `_`, `€`, ...).
 * - Las marcas combinantes y los caracteres invisibles o de control (`\p{M}`, `\p{C}`, por ejemplo U+200B) no
 *   cuentan para el largo ni como caracter especial: no se ven al escribir y no deben "completar" la política.
 */
const visibleChars = (p: string): string[] => [...p.normalize('NFC')].filter((c) => !/[\p{M}\p{C}]/u.test(c));

const RULES: ReadonlyArray<{ test: (p: string) => boolean; message: string }> = [
  { test: (p) => visibleChars(p).length >= PASSWORD_MIN_LENGTH, message: `al menos ${PASSWORD_MIN_LENGTH} caracteres` },
  { test: (p) => /\p{Lu}/u.test(p), message: 'una letra mayúscula' },
  { test: (p) => /\p{Ll}/u.test(p), message: 'una letra minúscula' },
  { test: (p) => /\p{Nd}/u.test(p), message: 'un número' },
  { test: (p) => /[^\p{L}\p{N}\p{M}\p{C}\s]/u.test(p), message: 'un caracter especial (por ejemplo ! # $ % _ -)' },
];

/** Devuelve TODOS los requisitos que la contraseña no cumple (vacío = cumple la política). */
export function passwordPolicyErrors(password: string): string[] {
  return RULES.filter((r) => !r.test(password)).map((r) => r.message);
}

/** Mensaje único con todo lo que falta, para que el usuario lo corrija de una sola vez. */
export function passwordPolicyMessage(missing: string[]): string {
  return `La contraseña no es segura. Le falta: ${missing.join(', ')}.`;
}

/**
 * Exige la política de contraseñas en un DTO. Se usa en TODOS los lugares donde se elige una
 * contraseña nueva (alumno: /sso/set-password; admin: alta, "Mi perfil"). No se usa en los campos que
 * solo verifican una contraseña existente (login, confirmación del admin, etc.), para no dejar afuera
 * a cuentas creadas antes de la política.
 */
export function IsStrongPassword(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && passwordPolicyErrors(value).length === 0,
        defaultMessage: (args) =>
          typeof args?.value === 'string'
            ? passwordPolicyMessage(passwordPolicyErrors(args.value))
            : 'La contraseña debe ser un texto.',
      },
    });
  };
}
