import { IsString, MinLength, Equals } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteSelfAdminDto {
  @ApiProperty({
    example: '••••••••',
    description: 'Contraseña actual del administrador.',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'borrar-mi-cuenta-no-es-reversible',
    description: 'Frase de confirmación. Debe ser exactamente: borrar-mi-cuenta-no-es-reversible',
  })
  @IsString()
  @Equals('borrar-mi-cuenta-no-es-reversible', {
    message: 'La frase de confirmación no es correcta.',
  })
  confirmationPhrase!: string;
}