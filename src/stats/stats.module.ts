import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { StatsController } from './controllers/stats.controller.js';
import { StatsService } from './services/stats.service.js';
import { OAuthClientEntity } from '../oauth-client/entities/oauth-client.entity.js';
import { StudentEntity } from '../student/entities/student.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthClientEntity, StudentEntity]),
    JwtModule.register({}),
  ],
  controllers: [StatsController],
  providers: [{ provide: 'IStatsService', useClass: StatsService }],
})
export class StatsModule {}