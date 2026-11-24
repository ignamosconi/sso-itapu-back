import { IsString, MaxLength } from 'class-validator';
import { IsDbIntString } from '../../common/validators/is-db-int.validator.js';
import { ApiProperty } from '@nestjs/swagger';

export class LogoutRequestDto {
  @ApiProperty({ example: '1', description: 'ID de la app OAuth dueña de la sesión.' })
  @IsDbIntString()
  readonly client_id!: string;

  @ApiProperty({ description: 'Secret de la app OAuth (credencial server-to-server).' })
  @IsString()
  @MaxLength(256)
  readonly client_secret!: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  @MaxLength(4096)
  readonly refresh_token!: string;
}