import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestEmailChangeDto {
  @ApiProperty({ description: 'Contraseña actual del alumno (debe estar presente).' })
  @IsString() @IsNotEmpty() @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'nuevo@gmail.com', description: 'Nuevo email del alumno.' })
  @IsEmail() @MaxLength(254)
  newEmail!: string;
}