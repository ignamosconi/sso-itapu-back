import { ApiProperty } from '@nestjs/swagger';

export class DomainRoleResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Regla "No se combina con otros cargos". Fija desde la creación.' })
  exclusive!: boolean;
  @ApiProperty({ description: 'Regla "Exactamente una especialidad". Fija desde la creación.' })
  singleSpecialty!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
