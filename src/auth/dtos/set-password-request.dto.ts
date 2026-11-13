import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPasswordRequestDto {
  @ApiProperty({ description: 'Token recibido por email.' })
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ minLength: 8, description: 'Debe coincidir con password.' })
  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}