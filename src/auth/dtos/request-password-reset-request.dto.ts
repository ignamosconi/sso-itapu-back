import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestPasswordResetRequestDto {
  @ApiProperty({ example: 'immosconi136' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;
}