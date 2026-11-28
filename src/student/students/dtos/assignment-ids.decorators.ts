import { applyDecorators } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DB_INT_MAX } from '../../../common/validators/is-db-int.validator.js';
import { MAX_ROLES_PER_USER, MAX_SPECIALTIES_PER_USER } from '../../../domain-role/utils/assignment-rules.js';

/**
 * Validación de listas de ids de cargos / especialidades. Compartida por el alta, la edición y la
 * confirmación del Excel para que todos los puntos de entrada acepten exactamente lo mismo.
 * Las reglas de negocio (cargos que no se combinan, exactamente una especialidad) se validan en el
 * servicio con checkAssignmentRules(), porque dependen de datos de la base.
 */
function idList(min: number, max: number, minMsg: string, uniqueMsg: string) {
  return applyDecorators(
    IsArray(),
    ArrayMinSize(min, { message: minMsg }),
    ArrayMaxSize(max),
    ArrayUnique({ message: uniqueMsg }),
    Type(() => Number),
    IsInt({ each: true }),
    Min(1, { each: true }),
    Max(DB_INT_MAX, { each: true }),
  );
}

export const IsDomainRoleIdList = () =>
  idList(1, MAX_ROLES_PER_USER, 'Indicá al menos un cargo.', 'Hay cargos repetidos.');

export const IsSpecialtyIdList = () =>
  idList(1, MAX_SPECIALTIES_PER_USER, 'Indicá al menos una especialidad.', 'Hay especialidades repetidas.');
