"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const serve_static_1 = require("@nestjs/serve-static");
const typeorm_1 = require("@nestjs/typeorm");
const path_1 = require("path");
const redis_module_js_1 = require("./redis/redis.module.js");
const auth_module_js_1 = require("./auth/auth.module.js");
const admin_module_js_1 = require("./admin/admin.module.js");
const admin_auth_module_js_1 = require("./admin-auth/admin-auth.module.js");
const oauth_client_module_js_1 = require("./oauth-client/oauth-client.module.js");
const code_module_js_1 = require("./code/code.module.js");
const admin_entity_js_1 = require("./admin/entities/admin.entity.js");
const oauth_client_entity_js_1 = require("./oauth-client/entities/oauth-client.entity.js");
const refresh_token_entity_js_1 = require("./refresh-token/entities/refresh-token.entity.js");
const credential_token_entity_js_1 = require("./credential-token/entities/credential-token.entity.js");
const credential_token_module_js_1 = require("./credential-token/credential-token.module.js");
const domain_role_module_js_1 = require("./domain-role/domain-role.module.js");
const specialty_module_js_1 = require("./specialty/specialty.module.js");
const student_module_js_1 = require("./student/student.module.js");
const password_reset_token_module_js_1 = require("./password-reset-token/password-reset-token.module.js");
const domain_role_entity_js_1 = require("./domain-role/entities/domain-role.entity.js");
const specialty_entity_js_1 = require("./specialty/entities/specialty.entity.js");
const student_entity_js_1 = require("./student/entities/student.entity.js");
const password_reset_token_entity_js_1 = require("./password-reset-token/entities/password-reset-token.entity.js");
const mail_module_js_1 = require("./mail/mail.module.js");
const admin_seeder_js_1 = require("./database/seeders/admin.seeder.js");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            redis_module_js_1.RedisModule,
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, 'public'),
                serveRoot: '/app',
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    type: 'postgres',
                    host: configService.getOrThrow('DB_HOST'),
                    port: configService.getOrThrow('DB_PORT'),
                    username: configService.getOrThrow('DB_USERNAME'),
                    password: configService.getOrThrow('DB_PASSWORD'),
                    database: configService.getOrThrow('DB_NAME'),
                    entities: [
                        admin_entity_js_1.AdminEntity,
                        oauth_client_entity_js_1.OAuthClientEntity,
                        refresh_token_entity_js_1.RefreshTokenEntity,
                        credential_token_entity_js_1.CredentialTokenEntity,
                        domain_role_entity_js_1.DomainRoleEntity,
                        specialty_entity_js_1.SpecialtyEntity,
                        student_entity_js_1.StudentEntity,
                        password_reset_token_entity_js_1.PasswordResetTokenEntity,
                    ],
                    synchronize: false,
                    migrations: [(0, path_1.join)(__dirname, 'database', 'migrations', '*.js')],
                    migrationsRun: true,
                }),
            }),
            typeorm_1.TypeOrmModule.forFeature([admin_entity_js_1.AdminEntity]),
            throttler_1.ThrottlerModule.forRoot([
                {
                    name: 'global',
                    ttl: 60000,
                    limit: 30,
                },
            ]),
            auth_module_js_1.AuthModule,
            admin_module_js_1.AdminModule,
            admin_auth_module_js_1.AdminAuthModule,
            oauth_client_module_js_1.OAuthClientModule,
            code_module_js_1.CodeModule,
            credential_token_module_js_1.CredentialTokenModule,
            domain_role_module_js_1.DomainRoleModule,
            specialty_module_js_1.SpecialtyModule,
            student_module_js_1.StudentModule,
            password_reset_token_module_js_1.PasswordResetTokenModule,
            mail_module_js_1.MailModule,
        ],
        providers: [
            admin_seeder_js_1.AdminSeeder,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map