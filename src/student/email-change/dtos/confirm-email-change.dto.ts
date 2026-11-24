import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmEmailChangeDto {
  @ApiProperty({ description: 'Token recibido por mail en el email nuevo.' })
  @IsString() @IsNotEmpty() @MaxLength(128)
  token!: string;
}