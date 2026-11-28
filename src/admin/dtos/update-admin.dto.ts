import { IsString, MinLength, IsOptional, MaxLength, Matches, ValidateIf, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMaxBytes } from '../../common/validators/max-bytes.validator.js';
import { IsStrongPassword } from '../../common/validators/password-policy.validator.js';

export class UpdateAdminDto {
  @ApiPropertyOptional({
    example: 'admin_itapu_editado',
    minLength: 3,
    maxLength: 32,
    description: 'Solo letras (con tildes), números, puntos (.), guiones bajos (_) y guiones medios (-). Sin espacios.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ0-9._-]+$/, {
    message:
      'El nombre de usuario solo puede contener letras (con tildes), números, puntos (.), guiones bajos (_) y guiones medios (-). No se permiten espacios ni caracteres especiales.',
  })
  username?: string;

  @ApiPropertyOptional({ example: 'Nueva_Password1', minLength: 8, description: 'Mínimo 8 caracteres, con al menos una mayúscula, una minúscula, un número y un caracter especial (cualquier símbolo que no sea letra, número ni espacio). Máximo 72 bytes.' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @IsStrongPassword()
  @IsMaxBytes()
  password?: string;

  @ApiPropertyOptional({
    example: 'password_actual',
    description: 'Contraseña actual. Requerida para confirmar cambios de usuario o contraseña.',
  })
  @ValidateIf((o: UpdateAdminDto) => Boolean(o.username || o.password))
  @IsNotEmpty({ message: 'Debés ingresar tu contraseña actual para confirmar los cambios.' })
  @IsString()
  currentPassword?: string;
}