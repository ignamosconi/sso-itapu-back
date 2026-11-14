import { IsString, MinLength, MaxLength, Matches, IsEmail, IsInt, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

  @ApiProperty({ example: 44244136, description: 'DNI sin puntos.' })
  @Type(() => Number)
  @IsInt()
  @Min(1000000)
  @Max(2000000000)
  dni!: number;

  @ApiProperty({ example: '2003-05-15', description: 'Formato YYYY-MM-DD.' })
  @IsDateString()
  birth_date!: string;

  @ApiProperty({ example: 1, description: 'ID del rol institucional.' })
  @Type(() => Number)
  @IsInt()
  domain_role_id!: number;

  @ApiProperty({ example: 1, description: 'ID de la especialidad.' })
  @Type(() => Number)
  @IsInt()
  specialty_id!: number;
}