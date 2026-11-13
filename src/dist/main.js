"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const core_1 = require("@nestjs/core");
const helmet_1 = __importDefault(require("helmet"));
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const express_basic_auth_1 = __importDefault(require("express-basic-auth"));
const app_module_js_1 = require("./app.module.js");
const config_1 = require("@nestjs/config");
const admin_seeder_js_1 = require("./database/seeders/admin.seeder.js");
const KNOWN_WEAK_SECRETS = new Set([
    'cambia_este_secret_acceso',
    'cambia_este_secret_refresco',
    'cambia_este_secret_admin_acceso',
    'cambia_este_secret_admin_refresco',
    'cambia_esta_password_min_8_caracteres',
    'cambia_esta_password_swagger',
    'admin',
    'cambia_esta_password_redis',
]);
function assertSecrets(configService) {
    const env = configService.get('NODE_ENV') ?? 'development';
    if (env !== 'production')
        return;
    const secretsToCheck = [
        configService.get('JWT_ACCESS_SECRET') ?? '',
        configService.get('JWT_REFRESH_SECRET') ?? '',
        configService.get('JWT_ADMIN_ACCESS_SECRET') ?? '',
        configService.get('JWT_ADMIN_REFRESH_SECRET') ?? '',
        configService.get('ADMIN_PASSWORD_SEEDER') ?? '',
        configService.get('SWAGGER_PASSWORD') ?? '',
        configService.get('SWAGGER_USER') ?? '',
        configService.get('REDIS_PASSWORD') ?? '',
    ];
    for (const secret of secretsToCheck) {
        if (KNOWN_WEAK_SECRETS.has(secret)) {
            throw new Error('[Seguridad] Se detectó un secreto por defecto del .env.example en entorno production. ' +
                'Rotá todos los secretos JWT, passwords de seeder y credenciales de Swagger antes de desplegar.');
        }
    }
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_js_1.AppModule);
    app.use((0, helmet_1.default)({
        frameguard: { action: 'deny' },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
        },
        noSniff: true,
        hidePoweredBy: true,
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:'],
                scriptSrc: ["'self'"],
                connectSrc: ["'self'"],
                frameAncestors: ["'none'"],
            },
        },
        crossOriginOpenerPolicy: { policy: 'unsafe-none' }
    }));
    app.enableCors({
        origin: process.env.ADMIN_PANEL_URL ?? 'http://localhost:5173',
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    const configService = app.get(config_1.ConfigService);
    assertSecrets(configService);
    const port = configService.get('PORT') || 3000;
    const swaggerUser = configService.getOrThrow('SWAGGER_USER');
    const swaggerPassword = configService.getOrThrow('SWAGGER_PASSWORD');
    app.use(['/docs', '/docs-json'], (0, express_basic_auth_1.default)({
        challenge: true,
        users: { [swaggerUser]: swaggerPassword },
    }));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('SSO FRVM')
        .setDescription('Servidor OAuth 2.0 para autenticación de alumnos de UTN FRVM.')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'alumno-jwt')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'admin-jwt')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('docs', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
        },
    });
    const seeder = app.get(admin_seeder_js_1.AdminSeeder);
    await seeder.seed();
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok' });
    });
    httpAdapter.get('/health/autogestion', async (_req, res) => {
        try {
            const { default: axios } = await import('axios');
            await axios.post(`${process.env.AUTOGESTION_BASE_URL}/login`, {}, {
                headers: { nick: '', password: '' },
                timeout: 5000,
            });
            res.status(200).json({ status: 'ok' });
        }
        catch (err) {
            const axiosErr = err;
            if (axiosErr?.response) {
                res.status(200).json({ status: 'ok' });
            }
            else {
                res.status(503).json({ status: 'down' });
            }
        }
    });
    await app.listen(port);
}
void bootstrap();
//# sourceMappingURL=main.js.map