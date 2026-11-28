import { IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsMaxBytes } from '../../common/validators/max-bytes.validator.js';
import { IsStrongPassword } from '../../common/validators/password-policy.validator.js';

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

  @ApiProperty({ example: 'Password_Segura1', minLength: 8, description: 'Mínimo 8 caracteres, con al menos una mayúscula, una minúscula, un número y un caracter especial (cualquier símbolo que no sea letra, número ni espacio). Máximo 72 bytes.' })
  @IsString()
  @MaxLength(128)
  @IsStrongPassword()
  @IsMaxBytes()
  password!: string;
}