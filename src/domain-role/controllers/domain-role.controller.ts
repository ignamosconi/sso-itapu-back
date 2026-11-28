import { ParseDbIdPipe } from '../../common/pipes/parse-db-id.pipe.js';
import { Controller, Get, Post, Delete, Body, Param, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IDomainRoleController } from './domain-role.controller.interface.js';
import type { IDomainRoleService } from '../services/domain-role.service.interface.js';
import { CreateDomainRoleDto } from '../dtos/create-domain-role.dto.js';
import { DomainRoleResponseDto } from '../dtos/domain-role-response.dto.js';
import { AdminJwtGuard } from '../../common/guards/admin-jwt.guard.js';
import { AdminThrottle } from '../../common/decorators/admin-throttle.decorator.js';

@ApiTags('Admin — Cargos institucionales')
@ApiBearerAuth('admin-jwt')
@UseGuards(AdminJwtGuard)
@AdminThrottle()
@Controller('admin/domain-roles')
export class DomainRoleController implements IDomainRoleController {
  constructor(
    @Inject('IDomainRoleService')
    private readonly service: IDomainRoleService,
  ) {}

  @ApiOperation({ summary: 'Listar todos los cargos institucionales' })
  @ApiResponse({ status: 200, type: [DomainRoleResponseDto] })
  @Get()
  findAll(): Promise<DomainRoleResponseDto[]> { return this.service.findAll(); }

  @ApiOperation({ summary: 'Obtener un cargo por ID' })
  @ApiResponse({ status: 200, type: DomainRoleResponseDto })
  @ApiResponse({ status: 404, description: 'Cargo no encontrado' })
  @Get(':id')
  findOne(@Param('id', ParseDbIdPipe) id: number): Promise<DomainRoleResponseDto> {
    return this.service.findOne(id);
  }

  @ApiOperation({
    summary: 'Crear un nuevo cargo institucional',
    description:
      'Las reglas "exclusive" (no se combina con otros cargos) y "single_specialty" (exactamente una especialidad) ' +
      'se fijan acá y NO se pueden cambiar después: no existe endpoint de edición de cargos y cualquier campo no ' +
      'documentado se rechaza con 400. Para cambiar una regla hay que eliminar el cargo (solo si no tiene usuarios) ' +
      'y crearlo de nuevo.',
  })
  @ApiResponse({ status: 201, type: DomainRoleResponseDto })
  @ApiResponse({ status: 409, description: 'El cargo ya existe' })
  @Post()
  create(@Body() dto: CreateDomainRoleDto): Promise<DomainRoleResponseDto> {
    return this.service.create(dto);
  }

  @ApiOperation({
    summary: 'Eliminar un cargo institucional',
    description: 'No se puede eliminar si hay usuarios que tengan este cargo (entre sus cargos).',
  })
  @ApiResponse({ status: 200, description: 'Cargo eliminado' })
  @ApiResponse({ status: 400, description: 'Hay usuarios con este cargo' })
  @ApiResponse({ status: 404, description: 'Cargo no encontrado' })
  @Delete(':id')
  remove(@Param('id', ParseDbIdPipe) id: number): Promise<void> {
    return this.service.remove(id);
  }
}