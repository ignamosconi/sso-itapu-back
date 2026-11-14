import { IsArray, ValidateNested, IsString, IsInt, IsEmail, IsDateString, Min, Max, MinLength, MaxLength, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

const NAME_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/;
const NAME_MSG = 'Solo se permiten letras (con tildes) y espacios.';

export class ImportStudentRowDto {
  @IsString() @MinLength(2) @MaxLength(64)
  @Matches(NAME_REGEX, { message: NAME_MSG })
  first_name!: string;

  @IsString() @MinLength(2) @MaxLength(64)
  @Matches(NAME_REGEX, { message: NAME_MSG })
  last_name!: string;

  @IsInt() @Min(1000000) @Max(2000000000)
  @Type(() => Number)
  dni!: number;

  @IsEmail()
  email!: string;

  @IsDateString()
  birth_date!: string;

  @IsInt()
  @Type(() => Number)
  domainRoleId!: number;

  @IsInt()
  @Type(() => Number)
  specialtyId!: number;
}

export class ImportConfirmDto {
  @ApiProperty({ type: [ImportStudentRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  rows!: ImportStudentRowDto[];
}

export class ImportConfirmResultDto {
  @ApiProperty() imported!: number;
  @ApiProperty() usernameCollisions!: number;
}