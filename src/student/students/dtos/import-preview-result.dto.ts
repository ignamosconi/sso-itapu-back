import { ApiProperty } from '@nestjs/swagger';

export class ImportPreviewRowDto {
  @ApiProperty() rowNumber!: number;
  @ApiProperty() valid!: boolean;
  @ApiProperty({ required: false }) errors?: string[];
  @ApiProperty() data!: Record<string, unknown>;
}

export class ImportPreviewResultDto {
  @ApiProperty() total!: number;
  @ApiProperty() valid!: number;
  @ApiProperty() invalid!: number;
  @ApiProperty({ type: [ImportPreviewRowDto] }) rows!: ImportPreviewRowDto[];
}