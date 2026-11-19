import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { StudentEntity } from './entities/student.entity.js';
import { OAuthClientEntity } from '../oauth-client/entities/oauth-client.entity.js';
import { RefreshTokenModule } from '../refresh-token/refresh-token.module.js';
import { DomainRoleEntity } from '../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../specialty/entities/specialty.entity.js';
import { StudentService } from './services/student.service.js';
import { StudentController } from './controllers/student.controller.js';
import { PasswordResetTokenModule } from '../password-reset-token/password-reset-token.module.js';
import { MailModule } from '../mail/mail.module.js';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudentEntity, DomainRoleEntity, SpecialtyEntity, OAuthClientEntity]),
    ConfigModule,
    PasswordResetTokenModule,
    MailModule,
    JwtModule.register({}),
    RefreshTokenModule,
  ],
  controllers: [StudentController],
  providers: [{ provide: 'IStudentService', useClass: StudentService }],
  exports: ['IStudentService'],
})
export class StudentModule {}