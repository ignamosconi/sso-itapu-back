import { ApiProperty } from '@nestjs/swagger';

/** Referencia { id, name } a un cargo o especialidad. */
export class NamedRefDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
}

export class StudentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() first_name!: string;
  @ApiProperty() last_name!: string;
  @ApiProperty() email!: string;
  @ApiProperty() dni!: number;
  @ApiProperty() birth_date!: Date;
  @ApiProperty() account_status!: string;
  @ApiProperty() hasPassword!: boolean;
  @ApiProperty({ type: [NamedRefDto], description: 'Cargos del usuario (al menos uno), ordenados alfabéticamente.' })
  domainRoles!: NamedRefDto[];
  @ApiProperty({ type: [NamedRefDto], description: 'Especialidades del usuario (al menos una), ordenadas alfabéticamente.' })
  specialties!: NamedRefDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
