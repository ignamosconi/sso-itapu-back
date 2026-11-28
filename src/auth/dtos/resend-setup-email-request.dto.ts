import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ResendSetupEmailRequestDto {
  @ApiProperty({ example: 'immosconi456' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;
}