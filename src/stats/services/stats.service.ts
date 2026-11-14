import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IStatsService } from './stats.service.interface.js';
import { DashboardStatsDto, SpecialtyCountDto } from '../dtos/dashboard-stats.dto.js';
import { OAuthClientEntity } from '../../oauth-client/entities/oauth-client.entity.js';
import { StudentEntity, AccountStatus } from '../../student/entities/student.entity.js';

@Injectable()
export class StatsService implements IStatsService {
  constructor(
    @InjectRepository(OAuthClientEntity)
    private readonly oauthClientRepo: Repository<OAuthClientEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepo: Repository<StudentEntity>,
  ) {}

  async getDashboard(): Promise<DashboardStatsDto> {
    const [oauthClientCount, studentCount, pendingRegistrationCount, raw] = await Promise.all([
      this.oauthClientRepo.count({ where: { isActive: true } }),
      this.studentRepo.count(),
      this.studentRepo.count({ where: { account_status: AccountStatus.PendingRegistration } }),
      this.studentRepo
        .createQueryBuilder('s')
        .select('sp.name', 'specialty')
        .addSelect('CAST(COUNT(s.id) AS INTEGER)', 'count')
        .innerJoin('s.specialty', 'sp')
        //.where('s.account_status = :status', { status: AccountStatus.Active })    //Usar este para mostrar solo activos.
        .where('s.account_status != :status', { status: AccountStatus.Suspended })
        .groupBy('sp.name')
        .orderBy('COUNT(s.id)', 'DESC')
        .getRawMany<SpecialtyCountDto>(),
    ]);

    return { oauthClientCount, studentCount, pendingRegistrationCount, studentsBySpecialty: raw };
  }
}