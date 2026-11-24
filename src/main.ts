import * as dotenv from 'dotenv';
dotenv.config();

import type { Request, Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { AdminSeeder } from './database/seeders/admin.seeder.js';
import { assertSecrets, parseTrustProxy } from './config/startup-checks.js';


async function bootstrap() {
  // Red de seguridad: una promesa rechazada sin capturar se registra en vez de tumbar el proceso.
  process.on('unhandledRejection', (reason) => {
    new Logger('unhandledRejection').error(reason instanceof Error ? (reason.stack ?? reason.message) : String(reason));
  });
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

  app.use(helmet({
    //Evita que el popup de login y la página de credenciales sean embebidos en iframes de otros orígenes (clickjacking)
    frameguard: { action: 'deny' },
    // Fuerza HTTPS en producción indicándole al browser que recuerde conectarse solo por HTTPS por 1 año
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    //Evita que el browser infiera el tipo de contenido
    noSniff: true,
    //Desactiva el header X-Powered-By (no revelar que usamos Express)
    hidePoweredBy: true,
    //CSP básica: solo recursos propios + Google Fonts (usados en login y credentials)
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
    //Se configuró la política COOP de Helmet como unsafe-none para permitir 
    //que el popup de login se comunique mediante postMessage con las aplicaciones cliente de origen cruzado."
    crossOriginOpenerPolicy: { policy: 'unsafe-none' }
  }));

  app.enableCors({
    origin: process.env.ADMIN_PANEL_URL ?? 'http://localhost:5173',
    credentials: true,
    // Sin esto, el navegador no deja leer el header Retry-After de los 429 y el
    // panel no puede mostrar cuánto hay que esperar.
    exposedHeaders: ['Retry-After'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  const configService = app.get(ConfigService);

  // Falla al arrancar si hay secretos por defecto en producción
  assertSecrets((key) => configService.get<string>(key));

  const port = configService.get<number>('PORT') || 3000;
  const swaggerUser = configService.getOrThrow<string>('SWAGGER_USER');
  const swaggerPassword = configService.getOrThrow<string>('SWAGGER_PASSWORD');

  app.use(
    ['/docs', '/docs-json'],
    basicAuth({
      challenge: true,
      users: { [swaggerUser]: swaggerPassword },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SSO ITAPU')
    .setDescription('Servidor OAuth 2.0 para autenticación de usuarios de ITAPU.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'alumno-jwt',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'admin-jwt',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const seeder = app.get(AdminSeeder);
  await seeder.seed();

  //endpoint /health para chequear si el SSO está activo.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  await app.listen(port);
}
void bootstrap();