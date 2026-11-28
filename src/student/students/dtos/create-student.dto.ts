import { IsString, MinLength, MaxLength, Matches, IsEmail, IsInt, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDomainRoleIdList, IsSpecialtyIdList } from './assignment-ids.decorators.js';
import { MAX_ROLES_PER_USER, MAX_SPECIALTIES_PER_USER } from '../../../domain-role/utils/assignment-rules.js';

const NAME_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/;
const NAME_MSG = 'Solo se permiten letras (con tildes) y espacios.';

export class CreateStudentDto {
  @ApiProperty({ example: 'Ignacio Mariano', description: NAME_MSG })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(NAME_REGEX, { message: NAME_MSG })
  first_name!: string;

  @ApiProperty({ example: 'Mosconi', description: NAME_MSG })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(NAME_REGEX, { message: NAME_MSG })
  last_name!: string;

  @ApiProperty({ example: 'alumno@gmail.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 30123456, description: 'DNI sin puntos.' })
  @Type(() => Number)
  @IsInt()
  @Min(1000000)
  @Max(2000000000)
  dni!: number;

  @ApiProperty({ example: '2003-05-15', description: 'Formato YYYY-MM-DD.' })
  @IsDateString()
  birth_date!: string;

  @ApiProperty({
    type: [Number],
    example: [2, 3],
    minItems: 1,
    maxItems: MAX_ROLES_PER_USER,
    description:
      'IDs de los cargos institucionales (al menos uno, sin repetidos). Si alguno de los cargos tiene la regla ' +
      '"exclusive", el usuario no puede tener otros cargos (400).',
  })
  @IsDomainRoleIdList()
  domain_role_ids!: number[];

  @ApiProperty({
    type: [Number],
    example: [1],
    minItems: 1,
    maxItems: MAX_SPECIALTIES_PER_USER,
    description:
      'IDs de las especialidades (al menos una, sin repetidas). Si alguno de los cargos tiene la regla ' +
      '"single_specialty", debe haber exactamente una (400).',
  })
  @IsSpecialtyIdList()
  specialty_ids!: number[];
}
