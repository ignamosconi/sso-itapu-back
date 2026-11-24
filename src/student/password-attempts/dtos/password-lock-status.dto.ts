import { ApiProperty } from '@nestjs/swagger';

export class PasswordLockStatusDto {
  @ApiProperty({
    description:
      'true si el alumno ya agotó sus intentos de contraseña: el próximo intento de baja se rechaza con 429.',
  })
  locked!: boolean;

  @ApiProperty({
    description: 'Segundos que faltan para que se levante el bloqueo. 0 si no está bloqueado.',
  })
  retryAfterSeconds!: number;
}