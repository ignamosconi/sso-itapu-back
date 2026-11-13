import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { StudentEntity } from './entities/student.entity.js';
import { DomainRoleEntity } from '../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../specialty/entities/specialty.entity.js';
import { StudentService } from './services/student.service.js';
import { StudentController } from './controllers/student.controller.js';
import { PasswordResetTokenModule } from '../password-reset-token/password-reset-token.module.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudentEntity, DomainRoleEntity, SpecialtyEntity]),
    ConfigModule,
    PasswordResetTokenModule,
    MailModule,
  ],
  controllers: [StudentController],
  providers: [{ provide: 'IStudentService', useClass: StudentService }],
  exports: ['IStudentService'],
})
export class StudentModule {}