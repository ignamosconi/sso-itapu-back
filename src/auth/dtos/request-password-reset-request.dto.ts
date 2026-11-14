import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestPasswordResetRequestDto {
  @ApiProperty({ example: 'immosconi136' })
  @IsString()
  username!: string;
}