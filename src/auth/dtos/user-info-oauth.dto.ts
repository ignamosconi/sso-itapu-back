import { ApiProperty } from '@nestjs/swagger';

export class UserInfoOauthDto {
  @ApiProperty({ example: 'uuid-del-usuario', description: 'Identificador único del usuario. No cambia nunca.' })
  readonly sub!: string;

  @ApiProperty({ example: 'Ignacio Mariano' })
  readonly nombre!: string;

  @ApiProperty({ example: 'Mosconi' })
  readonly apellido!: string;

  @ApiProperty({ example: 'immosconi136', description: 'Nombre de usuario del SSO.' })
  readonly username!: string;

  @ApiProperty({ example: 'Mecánica', description: 'Especialidad del usuario. Ver GET /sso/info/specialties para valores posibles.' })
  readonly especialidad!: string;

  @ApiProperty({ example: 'alumno@gmail.com' })
  readonly email!: string;

  @ApiProperty({ example: 'Alumno', description: 'Cargo institucional del usuario. Ver GET /sso/info/domain-roles para valores posibles.' })
  readonly cargo!: string;
}