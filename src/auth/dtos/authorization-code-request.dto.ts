import { IsString, IsUrl, MaxLength } from 'class-validator';
import { IsDbIntString } from '../../common/validators/is-db-int.validator.js';
import { ApiProperty } from '@nestjs/swagger';

export class AuthorizationCodeRequestDto {

  @ApiProperty({ example: '1' })
  @IsDbIntString()
  client_id!: string;

  @ApiProperty({ example: '57df647b26106facbd7bf95bb728dcb62a332123a080cd8b649596e92dfeb089' })
  @IsString()
  @MaxLength(256)
  client_secret!: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  @MaxLength(128)
  code!: string;

  @ApiProperty({
    examples: {
      localhost: {
        summary: 'Desarrollo local',
        value: 'http://localhost:4000/callback',
      },
      production: {
        summary: 'Aplicación en producción',
        value: 'https://app.example.com/oauth/callback',
      },
    },
  })
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  redirect_uri!: string;
}