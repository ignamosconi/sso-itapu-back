import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { StudentEntity } from './students/entities/student.entity.js';
import { EmailChangeRequestEntity } from './email-change/entities/email-change-request.entity.js';
import { OAuthClientEntity } from '../oauth-client/entities/oauth-client.entity.js';
import { RefreshTokenModule } from '../refresh-token/refresh-token.module.js';
import { DomainRoleEntity } from '../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../specialty/entities/specialty.entity.js';
import { StudentService } from './students/services/student.service.js';
import { PasswordAttemptsService } from './password-attempts/services/password-attempts.service.js';
import { StudentEmailChangeService } from './email-change/services/student-email-change.service.js';
import { StudentController } from './students/controllers/student.controller.js';
import { StudentEmailChangeController } from './email-change/controllers/student-email-change.controller.js';
import { PasswordResetTokenModule } from '../password-reset-token/password-reset-token.module.js';
import { MailModule } from '../mail/mail.module.js';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentEntity, DomainRoleEntity, SpecialtyEntity, OAuthClientEntity, EmailChangeRequestEntity,
    ]),
    ConfigModule,
    PasswordResetTokenModule,
    MailModule,
    JwtModule.register({}),
    RefreshTokenModule,
  ],
  controllers: [StudentController, StudentEmailChangeController],
  providers: [
    { provide: 'IStudentService', useClass: StudentService },
    // RedisModule es @Global(), por eso no hace falta importarlo acá.
    { provide: 'IPasswordAttemptsService', useClass: PasswordAttemptsService },
    { provide: 'IStudentEmailChangeService', useClass: StudentEmailChangeService },
  ],
  exports: ['IStudentService'],
})
export class StudentModule {}