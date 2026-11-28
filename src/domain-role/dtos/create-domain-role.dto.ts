import { IsString, MinLength, MaxLength, Matches, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDomainRoleDto {
  @ApiProperty({ example: 'Alumno', description: 'Solo letras (con tildes) y espacios.' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ ]+$/, {
    message: 'El nombre solo puede contener letras (con tildes) y espacios.',
  })
  name!: string;

  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'Regla "No se combina con otros cargos": si un usuario tiene este cargo, no puede tener ningún otro. ' +
      'Se fija al crear el cargo y NO se puede cambiar después (no existe endpoint de edición).',
  })
  @IsOptional()
  @IsBoolean()
  exclusive?: boolean;

  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'Regla "Exactamente una especialidad": si un usuario tiene este cargo (aunque tenga otros), debe tener ' +
      'exactamente una especialidad. Se fija al crear el cargo y NO se puede cambiar después.',
  })
  @IsOptional()
  @IsBoolean()
  single_specialty?: boolean;
}
