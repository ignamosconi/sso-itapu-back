import { IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdminDto {
  @ApiProperty({
    example: 'admin_itapu',
    minLength: 3,
    maxLength: 32,
    description: 'Solo letras (con tildes), números, puntos (.), guiones bajos (_) y guiones medios (-). Sin espacios.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ0-9._-]+$/, {
    message:
      'El nombre de usuario solo puede contener letras (con tildes), números, puntos (.), guiones bajos (_) y guiones medios (-). No se permiten espacios ni caracteres especiales.',
  })
  username!: string;

  @ApiProperty({ example: 'password_segura', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}