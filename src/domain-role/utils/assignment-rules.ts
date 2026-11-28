/**
 * Reglas de asignación de cargos y especialidades. ÚNICO lugar donde se interpretan.
 * La usan todos los puntos de entrada que asignan cargos: alta manual, vista previa y confirmación
 * del Excel, y edición (PATCH). No conoce ningún nombre de cargo: las reglas son datos de cada cargo.
 *
 *  1. Todo usuario tiene al menos un cargo y al menos una especialidad.
 *  2. Si ALGUNO de sus cargos es "exclusive", el usuario debe tener exactamente un cargo.
 *  3. Si ALGUNO de sus cargos es "singleSpecialty", el usuario debe tener exactamente una especialidad.
 */
export interface RuleRole {
  name: string;
  exclusive: boolean;
  singleSpecialty: boolean;
}

/** Máximo de cargos y de especialidades por usuario (límite técnico, no regla de negocio). */
export const MAX_ROLES_PER_USER = 10;
export const MAX_SPECIALTIES_PER_USER = 20;

/** Separador de valores múltiples en una celda del Excel. Se acepta ";" y ",". */
export const MULTI_VALUE_SEPARATOR = ';';

/** Devuelve la lista de errores (vacía si la asignación es válida). Mensajes listos para mostrar al admin. */
export function checkAssignmentRules(roles: RuleRole[], specialtyCount: number): string[] {
  const errors: string[] = [];

  if (roles.length === 0) errors.push('Debe tener al menos un cargo.');
  if (specialtyCount === 0) errors.push('Debe tener al menos una especialidad.');

  if (roles.length > 1) {
    for (const r of roles.filter(role => role.exclusive)) {
      errors.push(`El cargo "${r.name}" no se puede combinar con otros cargos.`);
    }
  }

  if (specialtyCount > 1) {
    for (const r of roles.filter(role => role.singleSpecialty)) {
      errors.push(`El cargo "${r.name}" exige exactamente una especialidad (se indicaron ${specialtyCount}).`);
    }
  }

  return errors;
}

/** Ordena alfabéticamente (es-AR, sin distinguir mayúsculas) para respuestas y tokens estables. */
export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}
