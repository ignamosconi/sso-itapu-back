import { registerDecorator, ValidationOptions } from 'class-validator';

/** Máximo de una columna Postgres `integer` (serial). Valores mayores provocan un 500 por overflow (N12). */
export const DB_INT_MAX = 2147483647;

/** Valida un id numérico entre 1 y DB_INT_MAX, recibido como texto (ej. client_id de un form). */
export function IsDbIntString(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isDbIntString',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) && Number(value) <= DB_INT_MAX,
        defaultMessage: () => `El valor debe ser un id numérico entre 1 y ${DB_INT_MAX}.`,
      },
    });
  };
}
