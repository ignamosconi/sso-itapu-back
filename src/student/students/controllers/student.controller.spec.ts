import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { StudentController } from './student.controller.js';
import { AdminJwtGuard } from '../../../common/guards/admin-jwt.guard.js';

const ID = '11111111-1111-4111-8111-111111111111';

describe('StudentController — límites de requests', () => {
  let app: INestApplication;
  // getHttpServer() devuelve `any`; se tipa acá una sola vez para que el lint no se queje.
  const server = () => app.getHttpServer() as App;

  const service = {
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    remove: jest.fn().mockResolvedValue(undefined),
    suspend: jest.fn().mockResolvedValue({}),
    getPasswordLockStatus: jest.fn().mockResolvedValue({ locked: true, retryAfterSeconds: 120 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Misma configuración que app.module.ts: un throttler llamado 'default' con 30 req/min.
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 30 }])],
      controllers: [StudentController],
      providers: [
        { provide: 'IStudentService', useValue: service },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('DELETE debería permitir 10 requests por minuto y responder 429 con Retry-After en el 11', async () => {
    for (let i = 0; i < 10; i++) {
      await request(server()).delete(`/admin/students/${ID}`).send({ password: 'x' }).expect(200);
    }

    const blocked = await request(server())
      .delete(`/admin/students/${ID}`)
      .send({ password: 'x' })
      .expect(429);

    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(service.remove).toHaveBeenCalledTimes(10);
  });

  it('el resto de los endpoints del controller no debería tener el límite de 10 ni el global de 30', async () => {
    for (let i = 0; i < 40; i++) {
      await request(server()).get('/admin/students').expect(200);
    }
    await request(server()).patch(`/admin/students/${ID}/suspend`).expect(200);
  });

  it('GET password-lock debería devolver el estado del bloqueo sin estar limitado a 10 por minuto', async () => {
    for (let i = 0; i < 15; i++) {
      const res = await request(server()).get(`/admin/students/${ID}/password-lock`).expect(200);
      expect(res.body).toEqual({ locked: true, retryAfterSeconds: 120 });
    }
    expect(service.getPasswordLockStatus).toHaveBeenCalledWith(ID);
  });

  describe('límite configurable por entorno', () => {
    afterEach(() => {
      delete process.env.STUDENT_DELETE_THROTTLE_LIMIT;
    });

    it('DELETE debería usar STUDENT_DELETE_THROTTLE_LIMIT del entorno', async () => {
      process.env.STUDENT_DELETE_THROTTLE_LIMIT = '2';

      await request(server()).delete(`/admin/students/${ID}`).send({}).expect(200);
      await request(server()).delete(`/admin/students/${ID}`).send({}).expect(200);
      await request(server()).delete(`/admin/students/${ID}`).send({}).expect(429);
    });

    it('DELETE debería usar el límite por defecto (10) si la variable es inválida', async () => {
      process.env.STUDENT_DELETE_THROTTLE_LIMIT = 'abc';

      for (let i = 0; i < 10; i++) {
        await request(server()).delete(`/admin/students/${ID}`).send({}).expect(200);
      }
      await request(server()).delete(`/admin/students/${ID}`).send({}).expect(429);
    });
  });
});
describe('StudentController — edición (PATCH)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as App;
  const service = { update: jest.fn().mockResolvedValue({ id: ID }) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 30 }])],
      controllers: [StudentController],
      providers: [{ provide: 'IStudentService', useValue: service }],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<{ admin: unknown }>().admin = { sub: 'admin-uuid', type: 'access' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('le pasa al servicio el id del admin autenticado (del token, no del body)', async () => {
    await request(server())
      .patch(`/admin/students/${ID}`)
      .send({ domain_role_ids: [1, 2], admin_password: 'pw' })
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(ID, { domain_role_ids: [1, 2], admin_password: 'pw' }, 'admin-uuid');
  });

  it('rechaza el pedido sin contraseña de admin o con un adminId en el body', async () => {
    await request(server()).patch(`/admin/students/${ID}`).send({ first_name: 'Nacho' }).expect(400);
    await request(server()).patch(`/admin/students/${ID}`).send({ first_name: 'Nacho', admin_password: 'pw', adminId: 'otro' }).expect(400);
    expect(service.update).not.toHaveBeenCalled();
  });
});
