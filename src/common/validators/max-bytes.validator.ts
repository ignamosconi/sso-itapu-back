import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Máximo de bytes (UTF-8) que bcrypt tiene en cuenta de una contraseña: lo que pase de 72 se ignora
 * en silencio. Se rechaza en vez de truncar, para que nadie crea que su contraseña es más larga de lo que es.
 */
export const BCRYPT_MAX_BYTES = 72;

/** Valida que un texto no supere `max` bytes en UTF-8 (los caracteres con tilde o ñ pesan 2 bytes). */
export function IsMaxBytes(max: number = BCRYPT_MAX_BYTES, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isMaxBytes',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max,
        defaultMessage: () => `La contraseña no puede superar los ${max} bytes (unos ${max} caracteres).`,
      },
    });
  };
}
