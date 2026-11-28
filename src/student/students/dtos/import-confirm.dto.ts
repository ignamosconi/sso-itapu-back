import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested, IsString, IsInt, IsEmail, IsDateString, Min, Max, MinLength, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsDomainRoleIdList, IsSpecialtyIdList } from './assignment-ids.decorators.js';

const NAME_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/;
const NAME_MSG = 'Solo se permiten letras (con tildes) y espacios.';

export class ImportStudentRowDto {
  @ApiProperty({ example: 'Ana' })
  @IsString() @MinLength(2) @MaxLength(64)
  @Matches(NAME_REGEX, { message: NAME_MSG })
  first_name!: string;

  @ApiProperty({ example: 'Pérez' })
  @IsString() @MinLength(2) @MaxLength(64)
  @Matches(NAME_REGEX, { message: NAME_MSG })
  last_name!: string;

  @ApiProperty({ example: 33456789 })
  @IsInt() @Min(1000000) @Max(2000000000)
  @Type(() => Number)
  dni!: number;

  @ApiProperty({ example: 'ana@ejemplo.com' })
  @IsEmail() @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '1998-11-22' })
  @IsDateString()
  birth_date!: string;

  @ApiProperty({
    type: [Number],
    example: [2, 3],
    description: 'IDs de cargos de la fila (los devuelve la vista previa). Las reglas de cada cargo se vuelven a validar al confirmar.',
  })
  @IsDomainRoleIdList()
  domainRoleIds!: number[];

  @ApiProperty({ type: [Number], example: [1, 4], description: 'IDs de especialidades de la fila.' })
  @IsSpecialtyIdList()
  specialtyIds!: number[];
}

export class ImportConfirmDto {
  @ApiProperty({ type: [ImportStudentRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  rows!: ImportStudentRowDto[];
}

export class ImportConfirmResultDto {
  @ApiProperty() imported!: number;
  @ApiProperty() usernameCollisions!: number;
}