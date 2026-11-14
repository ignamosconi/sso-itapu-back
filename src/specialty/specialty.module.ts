import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SpecialtyEntity } from './entities/specialty.entity.js';
import { SpecialtyService } from './services/specialty.service.js';
import { SpecialtyController } from './controllers/specialty.controller.js';


@Module({
  imports: [
    TypeOrmModule.forFeature([SpecialtyEntity]), 
    JwtModule.register({})
  ],
  controllers: [SpecialtyController],
  providers: [{ provide: 'ISpecialtyService', useClass: SpecialtyService }],
  exports: ['ISpecialtyService', TypeOrmModule],
})
export class SpecialtyModule {}