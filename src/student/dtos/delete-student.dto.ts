import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeleteStudentDto {
  @ApiPropertyOptional({
    description:
      'Contraseña del alumno, requerida si la cuenta ya tiene contraseña configurada. ' +
      'Si la cuenta está en estado pending_registration (sin contraseña), este campo puede omitirse.',
  })
  @IsOptional()
  @IsString()
  password?: string;
}