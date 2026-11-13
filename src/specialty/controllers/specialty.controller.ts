import { Controller, Get, Post, Delete, Body, Param, Inject, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { ISpecialtyController } from './specialty.controller.interface.js';
import type { ISpecialtyService } from '../services/specialty.service.interface.js';
import { CreateSpecialtyDto } from '../dtos/create-specialty.dto.js';
import { SpecialtyResponseDto } from '../dtos/specialty-response.dto.js';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard.js';

@ApiTags('Admin — Especialidades')
@ApiBearerAuth('admin-jwt')
@UseGuards(AdminJwtGuard)
@Controller('admin/specialties')
export class SpecialtyController implements ISpecialtyController {
  constructor(
    @Inject('ISpecialtyService')
    private readonly service: ISpecialtyService,
  ) {}

  @ApiOperation({ summary: 'Listar todas las especialidades' })
  @ApiResponse({ status: 200, type: [SpecialtyResponseDto] })
  @Get()
  findAll(): Promise<SpecialtyResponseDto[]> { return this.service.findAll(); }

  @ApiOperation({ summary: 'Obtener una especialidad por ID' })
  @ApiResponse({ status: 200, type: SpecialtyResponseDto })
  @ApiResponse({ status: 404, description: 'Especialidad no encontrada' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<SpecialtyResponseDto> {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Crear una nueva especialidad' })
  @ApiResponse({ status: 201, type: SpecialtyResponseDto })
  @ApiResponse({ status: 409, description: 'La especialidad ya existe' })
  @Post()
  create(@Body() dto: CreateSpecialtyDto): Promise<SpecialtyResponseDto> {
    return this.service.create(dto);
  }

  @ApiOperation({
    summary: 'Eliminar una especialidad',
    description: 'No se puede eliminar si hay usuarios asignados a esta especialidad.',
  })
  @ApiResponse({ status: 200, description: 'Especialidad eliminada' })
  @ApiResponse({ status: 400, description: 'Hay usuarios con esta especialidad' })
  @ApiResponse({ status: 404, description: 'Especialidad no encontrada' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.service.remove(id);
  }
}