import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty() domainRole!: { id: number; name: string };
  @ApiProperty() specialty!: { id: number; name: string };
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}