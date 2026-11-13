import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainRoleEntity } from './entities/domain-role.entity.js';
import { DomainRoleService } from './services/domain-role.service.js';
import { DomainRoleController } from './controllers/domain-role.controller.js';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([DomainRoleEntity]), 
    JwtModule.register({})
  ],
  controllers: [DomainRoleController],
  providers: [{ provide: 'IDomainRoleService', useClass: DomainRoleService }],
  exports: ['IDomainRoleService', TypeOrmModule],
})
export class DomainRoleModule {}