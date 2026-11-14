import { ApiProperty } from '@nestjs/swagger';

export class SpecialtyCountDto {
  @ApiProperty() specialty!: string;
  @ApiProperty() count!: number;
}

export class DashboardStatsDto {
  @ApiProperty() oauthClientCount!: number;
  @ApiProperty() studentCount!: number;
  @ApiProperty() pendingRegistrationCount!: number;
  @ApiProperty({ type: [SpecialtyCountDto] }) studentsBySpecialty!: SpecialtyCountDto[];
}