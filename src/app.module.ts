import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { RedisModule } from './redis/redis.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AdminAuthModule } from './admin-auth/admin-auth.module.js';
import { OAuthClientModule } from './oauth-client/oauth-client.module.js';
import { CodeModule } from './code/code.module.js';
import { AdminEntity } from './admin/entities/admin.entity.js';
import { OAuthClientEntity } from './oauth-client/entities/oauth-client.entity.js';
import { RefreshTokenEntity } from './refresh-token/entities/refresh-token.entity.js';
import { CredentialTokenEntity } from './credential-token/entities/credential-token.entity.js';
import { CredentialTokenModule } from './credential-token/credential-token.module.js';
import { DomainRoleModule } from './domain-role/domain-role.module.js';
import { SpecialtyModule } from './specialty/specialty.module.js';
import { StudentModule } from './student/student.module.js';
import { PasswordResetTokenModule } from './password-reset-token/password-reset-token.module.js';
import { DomainRoleEntity } from './domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from './specialty/entities/specialty.entity.js';
import { StudentEntity } from './student/entities/student.entity.js';
import { PasswordResetTokenEntity } from './password-reset-token/entities/password-reset-token.entity.js';
import { MailModule } from './mail/mail.module.js';
import { AdminSeeder } from './database/seeders/admin.seeder.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      serveRoot: '/app',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: configService.getOrThrow<number>('DB_PORT'),
        username: configService.getOrThrow<string>('DB_USERNAME'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),
        database: configService.getOrThrow<string>('DB_NAME'),
        entities: [
          AdminEntity, 
          OAuthClientEntity,
          RefreshTokenEntity,
          CredentialTokenEntity,
          DomainRoleEntity,
          SpecialtyEntity,
          StudentEntity,
          PasswordResetTokenEntity,
        ],
        synchronize: false,
        migrations: [join(__dirname, 'database', 'migrations', '*.js')],
        migrationsRun: true,
      }),
    }),
    TypeOrmModule.forFeature([AdminEntity]),
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000,   // ventana de 60 segundos
        limit: 30,    // máximo 30 requests por IP en esa ventana (endpoints generales)
      },
    ]),
    AuthModule,
    AdminModule,
    AdminAuthModule,
    OAuthClientModule,
    CodeModule,
    CredentialTokenModule,
    DomainRoleModule,
    SpecialtyModule,
    StudentModule,
    PasswordResetTokenModule,
    MailModule,
  ],
  providers: [    
    AdminSeeder,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  
})
export class AppModule {}