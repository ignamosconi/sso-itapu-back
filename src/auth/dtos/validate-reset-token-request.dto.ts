import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateResetTokenRequestDto {
  @ApiProperty({ description: 'Token de un solo uso recibido por email' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}