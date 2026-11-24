import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { IsDbIntString } from '../../common/validators/is-db-int.validator.js';

export class LoginRequestDto {
  @ApiProperty({ example: '1', description: 'ID del cliente OAuth registrado' })
  @IsDbIntString()
  client_id!: string;

  @ApiProperty({ example: 'http://localhost:4000/callback', description: 'URI de redirección registrada para el cliente' })
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  redirect_uri!: string;

  @ApiProperty({ example: 'state-aleatorio-xyz', description: 'Valor generado por la app cliente para prevenir CSRF' })
  @IsString()
  @MaxLength(512)
  state!: string;

  @ApiProperty({ example: 'immosconi136', description: 'Nombre de usuario del alumno.' })
  @IsString()
  @MaxLength(64)
  username!: string;

  @ApiProperty({ example: 'mi_contraseña_segura123!' })
  @IsString()
  @MaxLength(128)
  password!: string;
}