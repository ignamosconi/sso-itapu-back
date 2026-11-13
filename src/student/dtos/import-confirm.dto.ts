import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ImportStudentRowDto {
  first_name!: string;
  last_name!: string;
  dni!: number;
  email!: string;
  birth_date!: string;
  domainRoleId!: number;
  specialtyId!: number;
}

export class ImportConfirmDto {
  @ApiProperty({ type: [ImportStudentRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  rows!: ImportStudentRowDto[];
}

export class ImportConfirmResultDto {
  @ApiProperty() imported!: number;
  @ApiProperty() usernameCollisions!: number;
}