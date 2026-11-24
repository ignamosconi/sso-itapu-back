import { ApiProperty } from '@nestjs/swagger';

export class ResponsibleUserResponseDto {
  @ApiProperty()
  readonly id!: string;

  @ApiProperty()
  readonly username!: string;

  @ApiProperty()
  readonly fullName!: string;

  @ApiProperty({ description: 'Email censurado, ej: ju***@example.com' })
  readonly censoredEmail!: string;
}
