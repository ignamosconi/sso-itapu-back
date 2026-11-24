import { ApiProperty } from '@nestjs/swagger';

export class OAuthClientInfoDto {
  @ApiProperty({ example: 'Torneito' })
  readonly clientName!: string;

  @ApiProperty({ example: true })
  readonly isActive!: boolean;

  @ApiProperty({
    example: true,
    required: false,
    description: 'Solo se informa si se envió el query param redirect_uri.',
  })
  readonly redirectUriValid?: boolean;
}