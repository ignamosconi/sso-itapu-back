import { DashboardStatsDto } from '../dtos/dashboard-stats.dto.js';

export interface IStatsController {
  getDashboard(): Promise<DashboardStatsDto>;
}