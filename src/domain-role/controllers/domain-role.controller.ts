import { Controller, Get, Post, Delete, Body, Param, Inject, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IDomainRoleController } from './domain-role.controller.interface.js';
import type { IDomainRoleService } from '../services/domain-role.service.interface.js';
import { CreateDomainRoleDto } from '../dtos/create-domain-role.dto.js';
import { DomainRoleResponseDto } from '../dtos/domain-role-response.dto.js';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard.js';

@ApiTags('Admin — Roles institucionales')
@ApiBearerAuth('admin-jwt')
@UseGuards(AdminJwtGuard)
@Controller('admin/domain-roles')
export class DomainRoleController implements IDomainRoleController {
  constructor(
    @Inject('IDomainRoleService')
    private readonly service: IDomainRoleService,
  ) {}

  @ApiOperation({ summary: 'Listar todos los roles institucionales' })
  @ApiResponse({ status: 200, type: [DomainRoleResponseDto] })
  @Get()
  findAll(): Promise<DomainRoleResponseDto[]> { return this.service.findAll(); }

  @ApiOperation({ summary: 'Obtener un rol por ID' })
  @ApiResponse({ status: 200, type: DomainRoleResponseDto })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<DomainRoleResponseDto> {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Crear un nuevo rol institucional' })
  @ApiResponse({ status: 201, type: DomainRoleResponseDto })
  @ApiResponse({ status: 409, description: 'El rol ya existe' })
  @Post()
  create(@Body() dto: CreateDomainRoleDto): Promise<DomainRoleResponseDto> {
    return this.service.create(dto);
  }

  @ApiOperation({
    summary: 'Eliminar un rol institucional',
    description: 'No se puede eliminar si hay usuarios asignados a este rol.',
  })
  @ApiResponse({ status: 200, description: 'Rol eliminado' })
  @ApiResponse({ status: 400, description: 'Hay usuarios con este rol' })
  @ApiResponse({ status: 404, description: 'Rol no encontrado' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.service.remove(id);
  }
}