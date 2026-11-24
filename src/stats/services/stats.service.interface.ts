import { DashboardStatsDto } from '../dtos/dashboard-stats.dto.js';

export interface IStatsService {
  getDashboard(): Promise<DashboardStatsDto>;
}