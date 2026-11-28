import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../../common/validators/password-policy.validator.js';

export class SetPasswordRequestDto {
  @ApiProperty({ description: 'Token recibido por email.' })
  @IsString()
  @MaxLength(256)
  token!: string;

  @ApiProperty({ minLength: 8, example: 'Itapu#2026', description: 'Mínimo 8 caracteres, con al menos una mayúscula, una minúscula, un número y un caracter especial (cualquier símbolo que no sea letra, número ni espacio). Máximo 72 bytes.' })
  @IsString()
  @MaxLength(128)
  @IsStrongPassword()
  password!: string;

  @ApiProperty({ description: 'Debe coincidir con password.' })
  @IsString()
  @MaxLength(128)
  confirmPassword!: string;
}