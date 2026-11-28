import { ApiProperty } from '@nestjs/swagger';

export class UserInfoOauthDto {
  @ApiProperty({ example: 'uuid-del-usuario', description: 'Identificador único del usuario. No cambia nunca.' })
  readonly sub!: string;

  @ApiProperty({ example: 'Ignacio Mariano' })
  readonly nombre!: string;

  @ApiProperty({ example: 'Mosconi' })
  readonly apellido!: string;

  @ApiProperty({ example: 'immosconi456', description: 'Nombre de usuario del SSO.' })
  readonly username!: string;

  @ApiProperty({
    type: [String],
    example: ['Electrónica', 'Mecánica'],
    description:
      'Especialidades del usuario: siempre al menos una, ordenadas alfabéticamente. ' +
      'Ver GET /sso/info/specialties para valores posibles. Verificá con includes(), nunca con el primer elemento.',
  })
  readonly especialidades!: string[];

  @ApiProperty({ example: 'alumno@gmail.com' })
  readonly email!: string;

  @ApiProperty({
    type: [String],
    example: ['Preceptor', 'Profesor'],
    description:
      'Cargos institucionales del usuario: siempre al menos uno, ordenados alfabéticamente. ' +
      'Ver GET /sso/info/domain-roles para valores posibles. Para dar permisos verificá si ALGUNO de los cargos ' +
      'está en tu lista (ej. cargos.includes("Profesor")), nunca con el primer elemento.',
  })
  readonly cargos!: string[];
}