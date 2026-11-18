import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ResendSetupEmailRequestDto {
  @ApiProperty({ example: 'immosconi136' })
  @IsString()
  @IsNotEmpty()
  username!: string;
}