import { ApiProperty } from '@nestjs/swagger';

export class OAuthClientInfoDto {
  @ApiProperty({ example: 'Torneito' })
  readonly clientName!: string;

  @ApiProperty({ example: true })
  readonly isActive!: boolean;
}