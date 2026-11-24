import { IsString, MinLength, IsArray, ArrayMaxSize, ArrayMinSize, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { IsRedirectUri } from '../../common/validators/is-redirect-uri.validator.js';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOAuthClientDto {
  @ApiPropertyOptional({ example: 'Torneito v2', minLength: 2 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  clientName?: string;

  @ApiPropertyOptional({
    example: ['http://localhost:4000/callback', 'https://miapp.com/callback'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsRedirectUri({ each: true })
  redirectUris?: string[];

  @ApiPropertyOptional({ example: 'uuid-del-usuario', description: 'ID del nuevo usuario responsable (debe estar activo)' })
  @IsOptional()
  @IsUUID()
  responsibleUserId?: string;
}