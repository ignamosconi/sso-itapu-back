import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class StudentFiltersDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() domainRoleId?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() specialtyId?: number;
  @ApiPropertyOptional({ enum: ['active', 'suspended', 'pending_registration'] })
  @IsOptional() @IsIn(['active', 'suspended', 'pending_registration'])
  accountStatus?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}