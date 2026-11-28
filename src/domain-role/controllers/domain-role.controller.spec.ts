import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DomainRoleController } from './domain-role.controller.js';
import { AdminJwtGuard } from '../../common/guards/admin-jwt.guard.js';

describe('DomainRoleController — reglas inmutables', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer() as App;
  const service = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((dto: object) => Promise.resolve({ id: 1, ...dto })),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [DomainRoleController],
      providers: [{ provide: 'IDomainRoleService', useValue: service }],
    })
      .overrideGuard(AdminJwtGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('crea un cargo con sus reglas', async () => {
    await request(server()).post('/admin/domain-roles').send({ name: 'Alumno', exclusive: true, single_specialty: true }).expect(201);
    expect(service.create).toHaveBeenCalledWith({ name: 'Alumno', exclusive: true, single_specialty: true });
  });

  it.each(['patch', 'put'] as const)('no existe ruta %s para editar un cargo (las reglas no se pueden cambiar)', async (method) => {
    await request(server())[method]('/admin/domain-roles/1').send({ exclusive: false }).expect(404);
  });

  it('rechaza campos desconocidos en el alta', async () => {
    await request(server()).post('/admin/domain-roles').send({ name: 'Alumno', id: 5 }).expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
