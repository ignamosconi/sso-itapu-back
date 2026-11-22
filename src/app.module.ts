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
import { SsoInfoModule } from './sso-info/sso-info.module.js';
import { StatsModule } from './stats/stats.module.js';
import { AdminSeeder } from './database/seeders/admin.seeder.js';
import { ScheduleModule } from '@nestjs/schedule';

function positiveInt(config: ConfigService, name: string, fallback: number): number {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`[Config] ${name} debe ser un entero positivo (valor recibido: "${raw}").`);
  }
  return value;
}

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

    ScheduleModule.forRoot(), //Para limpiar la tabla de refresh tokens

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          // Tiene que llamarse 'default': los @Throttle/@SkipThrottle de los controllers apuntan a ese nombre.
          name: 'default',
          ttl: positiveInt(configService, 'THROTTLE_GLOBAL_TTL_MS', 60_000),
          limit: positiveInt(configService, 'THROTTLE_GLOBAL_LIMIT', 30),
        },
      ],
    }),
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
    SsoInfoModule,
    StatsModule,
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