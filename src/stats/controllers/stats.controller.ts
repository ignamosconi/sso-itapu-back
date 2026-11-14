import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { IStatsController } from './stats.controller.interface.js';
import type { IStatsService } from '../services/stats.service.interface.js';
import { DashboardStatsDto } from '../dtos/dashboard-stats.dto.js';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard.js';

@ApiTags('Admin — Estadísticas')
@ApiBearerAuth('admin-jwt')
@UseGuards(AdminJwtGuard)
@Controller('admin/stats')
export class StatsController implements IStatsController {
  constructor(
    @Inject('IStatsService')
    private readonly statsService: IStatsService,
  ) {}

  @ApiOperation({
    summary: 'Estadísticas del dashboard',
    description: 'Tres queries agregadas livianas. Respuesta cacheada 15 minutos en el cliente.',
  })
  @ApiResponse({ status: 200, type: DashboardStatsDto })
  @Get('dashboard')
  getDashboard(): Promise<DashboardStatsDto> {
    return this.statsService.getDashboard();
  }
}