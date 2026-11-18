import { ApiProperty } from '@nestjs/swagger';

export class OAuthClientCreatedResponseDto {
  @ApiProperty({ example: 1 })
  readonly id!: number;

  @ApiProperty({ example: 'Torneito' })
  readonly clientName!: string;

  @ApiProperty({ example: ['http://localhost:4000/callback', 'https://miapp.com/callback'] })
  readonly redirectUris!: string[];

  @ApiProperty()
  readonly createdAt!: Date;

  @ApiProperty()
  readonly updatedAt!: Date;
}