import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity.js';
import { PasswordResetTokenService } from './services/password-reset-token.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([PasswordResetTokenEntity]), ConfigModule],
  providers: [{ provide: 'IPasswordResetTokenService', useClass: PasswordResetTokenService }],
  exports: ['IPasswordResetTokenService'],
})
export class PasswordResetTokenModule {}