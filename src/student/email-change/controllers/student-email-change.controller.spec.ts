import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { StudentEmailChangeController } from './student-email-change.controller.js';
import { AdminJwtGuard } from '../../../common/guards/admin-jwt.guard.js';

const ID = '11111111-1111-4111-8111-111111111111';
const BODY = { password: 'ClaveAlumno123', newEmail: 'nuevo@gmail.com' };
// Mismo valor que usa el controller al cargarse (AUTH_ROUTE_PATH || 'oauth').
const CONFIRM = `/${process.env.AUTH_ROUTE_PATH || 'oauth'}/confirm-email-change`;

describe('StudentEmailChangeController', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as App;

  const service = {
    requestEmailChange: jest.fn().mockResolvedValue(undefined),
    confirmEmailChange: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Misma configuración que app.module.ts: un throttler llamado 'default' con 30 req/min.
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 30 }])],
      controllers: [StudentEmailChangeController],
      providers: [
        { provide: 'IStudentEmailChangeService', useValue: service },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST admin/students/:id/email-change', () => {
    it('debería responder 204 y pasar el id y el body al servicio', async () => {
      await request(server()).post(`/admin/students/${ID}/email-change`).send(BODY).expect(204);
      expect(service.requestEmailChange).toHaveBeenCalledWith(ID, BODY);
    });

    it.each([
      ['email inválido', { ...BODY, newEmail: 'no-es-un-email' }],
      ['sin contraseña', { newEmail: 'nuevo@gmail.com' }],
      ['contraseña vacía', { ...BODY, password: '' }],
      ['campo extra', { ...BODY, role: 'admin' }],
    ])('debería rechazar con 400 sin llamar al servicio (%s)', async (_label, body) => {
      await request(server()).post(`/admin/students/${ID}/email-change`).send(body).expect(400);
      expect(service.requestEmailChange).not.toHaveBeenCalled();
    });

    it('debería rechazar con 400 un id que no es UUID', async () => {
      await request(server()).post('/admin/students/abc/email-change').send(BODY).expect(400);
      expect(service.requestEmailChange).not.toHaveBeenCalled();
    });

    it('debería permitir 10 requests por minuto y responder 429 con Retry-After en el 11', async () => {
      for (let i = 0; i < 10; i++) {
        await request(server()).post(`/admin/students/${ID}/email-change`).send(BODY).expect(204);
      }
      const blocked = await request(server()).post(`/admin/students/${ID}/email-change`).send(BODY).expect(429);

      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(service.requestEmailChange).toHaveBeenCalledTimes(10);
    });

    describe('límite configurable por entorno', () => {
      afterEach(() => {
        delete process.env.STUDENT_EMAIL_CHANGE_THROTTLE_LIMIT;
      });

      it('debería usar STUDENT_EMAIL_CHANGE_THROTTLE_LIMIT del entorno', async () => {
        process.env.STUDENT_EMAIL_CHANGE_THROTTLE_LIMIT = '2';

        await request(server()).post(`/admin/students/${ID}/email-change`).send(BODY).expect(204);
        await request(server()).post(`/admin/students/${ID}/email-change`).send(BODY).expect(204);
        await request(server()).post(`/admin/students/${ID}/email-change`).send(BODY).expect(429);
      });

      it('debería usar el límite por defecto (10) si la variable es inválida', async () => {
        process.env.STUDENT_EMAIL_CHANGE_THROTTLE_LIMIT = 'abc';

        for (let i = 0; i < 10; i++) {
          await request(server()).post(`/admin/students/${ID}/email-change`).send(BODY).expect(204);
        }
        await request(server()).post(`/admin/students/${ID}/email-change`).send(BODY).expect(429);
      });
    });
  });

  describe('POST confirm-email-change', () => {
    it('debería responder 204 y pasar el token al servicio', async () => {
      await request(server()).post(CONFIRM).send({ token: 'abc123' }).expect(204);
      expect(service.confirmEmailChange).toHaveBeenCalledWith('abc123');
    });

    it.each([
      ['sin token', {}],
      ['token vacío', { token: '' }],
      ['token que no es texto', { token: 123 }],
    ])('debería rechazar con 400 sin llamar al servicio (%s)', async (_label, body) => {
      await request(server()).post(CONFIRM).send(body).expect(400);
      expect(service.confirmEmailChange).not.toHaveBeenCalled();
    });

    it('debería permitir 5 requests por minuto por IP y responder 429 en el 6', async () => {
      for (let i = 0; i < 5; i++) {
        await request(server()).post(CONFIRM).send({ token: 'abc' }).expect(204);
      }
      await request(server()).post(CONFIRM).send({ token: 'abc' }).expect(429);
      expect(service.confirmEmailChange).toHaveBeenCalledTimes(5);
    });

    it('no debería exigir el token de admin (es una ruta pública)', () => {
      // El guard está sobrescrito para dejar pasar; este test deja constancia de que la ruta pública
      // no lo declara: si alguien le agrega @UseGuards, el alumno no podría confirmar.
      // Se lee el método desde el descriptor (no como `prototype.confirmEmailChange`) para no
      // pasar una referencia a método suelta, que es lo que marca la regla unbound-method.
      const handler = Object.getOwnPropertyDescriptor(
        StudentEmailChangeController.prototype,
        'confirmEmailChange',
      )?.value as object;
      const guards = Reflect.getMetadata('__guards__', handler) as unknown[] | undefined;
      expect(guards).toBeUndefined();
    });
  });
});