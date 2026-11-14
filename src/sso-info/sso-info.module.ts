import { Module } from '@nestjs/common';
import { SsoInfoController } from './controllers/sso-info.controller.js';
import { DomainRoleModule } from '../domain-role/domain-role.module.js';
import { SpecialtyModule } from '../specialty/specialty.module.js';

@Module({
  imports: [DomainRoleModule, SpecialtyModule],
  controllers: [SsoInfoController],
})
export class SsoInfoModule {}