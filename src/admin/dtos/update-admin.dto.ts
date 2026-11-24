import { IsString, MinLength, IsOptional, MaxLength, Matches, ValidateIf, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMaxBytes } from '../../common/validators/max-bytes.validator.js';

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

  @ApiPropertyOptional({ example: 'nueva_password', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
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