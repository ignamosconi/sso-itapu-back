import { IsString, MinLength, IsArray, ArrayMaxSize, ArrayMinSize, IsUUID, MaxLength } from 'class-validator';
import { IsRedirectUri } from '../../common/validators/is-redirect-uri.validator.js';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOAuthClientDto {
  @ApiProperty({ example: 'Torneito', minLength: 2 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  clientName!: string;

  @ApiProperty({
    example: ['http://localhost:4000/callback', 'https://miapp.com/callback'],
    description: 'Mínimo 1, máximo 5 URIs. Podés incluir URLs de desarrollo (localhost) y producción.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsRedirectUri({ each: true })
  redirectUris!: string[];

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID del usuario responsable de la integración. Debe estar activo.',
  })
  @IsUUID()
  responsibleUserId!: string;
}