import { IsString, MinLength, MaxLength, Matches, IsInt, Min, Max, IsDateString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDomainRoleIdList, IsSpecialtyIdList } from './assignment-ids.decorators.js';
import { MAX_ROLES_PER_USER, MAX_SPECIALTIES_PER_USER } from '../../../domain-role/utils/assignment-rules.js';

const NAME_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/;
const NAME_MSG = 'Solo se permiten letras (con tildes) y espacios.';

export class UpdateStudentDto {
  @ApiPropertyOptional({ example: 'Ignacio Mariano' })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(64)
  @Matches(NAME_REGEX, { message: NAME_MSG })
  first_name?: string;

  @ApiPropertyOptional({ example: 'Mosconi' })
  @IsOptional() @IsString() @MinLength(2) @MaxLength(64)
  @Matches(NAME_REGEX, { message: NAME_MSG })
  last_name?: string;

  @ApiPropertyOptional({ example: 30123456 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000000) @Max(2000000000)
  dni?: number;

  @ApiPropertyOptional({ example: '2003-05-15' })
  @IsOptional() @IsDateString()
  birth_date?: string;

  @ApiPropertyOptional({
    type: [Number],
    example: [2, 3],
    minItems: 1,
    maxItems: MAX_ROLES_PER_USER,
    description: 'Reemplaza TODOS los cargos del usuario por esta lista. Se validan las reglas de cada cargo.',
  })
  @IsOptional()
  @IsDomainRoleIdList()
  domain_role_ids?: number[];

  @ApiPropertyOptional({
    type: [Number],
    example: [1],
    minItems: 1,
    maxItems: MAX_SPECIALTIES_PER_USER,
    description: 'Reemplaza TODAS las especialidades del usuario por esta lista. Se validan las reglas de sus cargos.',
  })
  @IsOptional()
  @IsSpecialtyIdList()
  specialty_ids?: number[];

  @ApiProperty({
    example: 'mi_password_de_admin',
    description:
      'Contraseña del administrador que hace el cambio (no la del usuario). Obligatoria: confirma que quien edita ' +
      'es el admin y no alguien con su sesión. Tiene límite de intentos por admin (ADMIN_CONFIRM_PASSWORD_*).',
  })
  @IsString()
  @IsNotEmpty({ message: 'Ingresá tu contraseña de administrador para confirmar los cambios.' })
  @MaxLength(128)
  admin_password!: string;
}
