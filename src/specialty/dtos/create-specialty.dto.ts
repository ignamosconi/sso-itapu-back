import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSpecialtyDto {
  @ApiProperty({ example: 'Matemática', description: 'Solo letras (con tildes) y espacios.' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/, {
    message: 'El nombre solo puede contener letras (con tildes) y espacios.',
  })
  name!: string;
}