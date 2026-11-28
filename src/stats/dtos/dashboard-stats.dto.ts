import { ApiProperty } from '@nestjs/swagger';

export class SpecialtyCountDto {
  @ApiProperty() specialty!: string;
  @ApiProperty() count!: number;
}

export class DashboardStatsDto {
  @ApiProperty() oauthClientCount!: number;
  @ApiProperty() studentCount!: number;
  @ApiProperty() pendingRegistrationCount!: number;
  @ApiProperty({
    type: [SpecialtyCountDto],
    description:
      'Usuarios no suspendidos por especialidad. Un usuario con varias especialidades cuenta en cada una, ' +
      'así que la suma puede superar studentCount.',
  })
  studentsBySpecialty!: SpecialtyCountDto[];
}