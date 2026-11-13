import { IsString, MinLength, MaxLength, Matches, IsInt, Min, Max, IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

  @ApiPropertyOptional({ example: 44244136 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000000) @Max(2000000000)
  dni?: number;

  @ApiPropertyOptional({ example: '2003-05-15' })
  @IsOptional() @IsDateString()
  birth_date?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @Type(() => Number) @IsInt()
  domain_role_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @Type(() => Number) @IsInt()
  specialty_id?: number;
}