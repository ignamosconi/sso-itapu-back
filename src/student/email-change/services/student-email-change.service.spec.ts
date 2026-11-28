jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { createHash } from 'crypto';
import {
  NotFoundException, GoneException, BadRequestException, ConflictException,
  ForbiddenException, HttpException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { StudentEmailChangeService } from './student-email-change.service.js';
import { StudentEntity, AccountStatus } from '../../students/entities/student.entity.js';
import { EmailChangeRequestEntity } from '../entities/email-change-request.entity.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStudent(overrides: Partial<StudentEntity> = {}): StudentEntity {
  return {
    id: 'student-uuid',
    first_name: 'Ignacio',
    last_name: 'Mosconi',
    username: 'immosconi456',
    email: 'alumno@gmail.com',
    password: '$2b$10$hashed',
    dni: 30123456,
    birth_date: new Date('2003-05-15'),
    account_status: AccountStatus.Active,
    domainRoleId: 1,
    specialtyId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as StudentEntity;
}

function makeRequest(overrides: Partial<EmailChangeRequestEntity> = {}): EmailChangeRequestEntity {
  return {
    id: 'req-1',
    studentId: 'student-uuid',
    newEmail: 'nuevo@gmail.com',
    tokenHash: 'hash',
    used: false,
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: new Date(),
    ...overrides,
  };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('StudentEmailChangeService', () => {
  let studentRepo: Record<string, jest.Mock> & { manager: { transaction: jest.Mock } };
  let requestRepo: Record<string, jest.Mock>;
  let refreshTokens: { revokeAllForSub: jest.Mock };
  let resetTokens: { invalidateAllForStudent: jest.Mock };
  let mail: { send: jest.Mock };
  let attempts: { registerAttempt: jest.Mock; reset: jest.Mock; getLockStatus: jest.Mock };
  let fakeManager: { update: jest.Mock };
  let emailInUseCount: jest.Mock;

  function build(env: Record<string, string> = {}) {
    const config = {
      getOrThrow: (key: string) => {
        if (key === 'ADMIN_PANEL_URL') return 'http://localhost:5173';
        throw new Error(`Config key not found: ${key}`);
      },
      get: (key: string) => env[key],
    };
    return new StudentEmailChangeService(
      studentRepo as never,
      requestRepo as never,
      refreshTokens as never,
      resetTokens as never,
      mail,
      attempts,
      config as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();

    fakeManager = { update: jest.fn().mockResolvedValue({}) };
    emailInUseCount = jest.fn().mockResolvedValue(0);
    studentRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: emailInUseCount,
      }),
      manager: {
        transaction: jest.fn().mockImplementation((cb: (m: unknown) => Promise<void>) => cb(fakeManager)),
      },
    } as never;
    requestRepo = {
      delete: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({ id: 'req-1' }),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    refreshTokens = { revokeAllForSub: jest.fn().mockResolvedValue(undefined) };
    resetTokens = { invalidateAllForStudent: jest.fn().mockResolvedValue(undefined) };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    attempts = {
      registerAttempt: jest.fn().mockResolvedValue({ attemptsRemaining: 4, retryAfterSeconds: 880 }),
      reset: jest.fn().mockResolvedValue(undefined),
      getLockStatus: jest.fn(),
    };
    (bcrypt.compare as jest.Mock).mockReset();
  });

  // ── configuración ───────────────────────────────────────────────────────────

  describe('configuración', () => {
    it('debería usar 1 hora de vencimiento si no hay variable de entorno', async () => {
      studentRepo.findOne.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const before = Date.now();

      await build().requestEmailChange('student-uuid', { password: 'x', newEmail: 'nuevo@gmail.com' });

      const saved = requestRepo.save.mock.calls[0][0] as { expiresAt: Date };
      expect(saved.expiresAt.getTime() - before).toBeGreaterThanOrEqual(3_600_000 - 50);
      expect(saved.expiresAt.getTime() - before).toBeLessThan(3_600_000 + 5_000);
    });

    it('debería tomar el vencimiento de EMAIL_CHANGE_TOKEN_TTL_MS', async () => {
      studentRepo.findOne.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      const before = Date.now();

      await build({ EMAIL_CHANGE_TOKEN_TTL_MS: '600000' })
        .requestEmailChange('student-uuid', { password: 'x', newEmail: 'nuevo@gmail.com' });

      const saved = requestRepo.save.mock.calls[0][0] as { expiresAt: Date };
      expect(saved.expiresAt.getTime() - before).toBeLessThan(600_000 + 5_000);
      expect(mail.send.mock.calls[0][2].html).toContain('10 minutos');
    });

    it.each([['abc'], ['0'], ['-5'], ['1.5']])('debería fallar al arrancar si EMAIL_CHANGE_TOKEN_TTL_MS es inválida (%s)', (bad) => {
      expect(() => build({ EMAIL_CHANGE_TOKEN_TTL_MS: bad })).toThrow('EMAIL_CHANGE_TOKEN_TTL_MS');
    });
  });

  // ── requestEmailChange ──────────────────────────────────────────────────────

  describe('requestEmailChange', () => {
    const dto = { password: 'ClaveAlumno123', newEmail: 'Nuevo@Gmail.com ' };

    beforeEach(() => {
      studentRepo.findOne.mockResolvedValue(makeStudent());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    it('debería guardar la solicitud con el email normalizado y el hash del token (nunca el token en claro)', async () => {
      await build().requestEmailChange('student-uuid', dto);

      expect(requestRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'student-uuid',
          newEmail: 'nuevo@gmail.com',
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        }),
      );
      const [, , content] = mail.send.mock.calls[0] as [string, string, { html: string }];
      const plain = /token=([a-f0-9]{64})/.exec(content.html)![1];
      expect((requestRepo.save.mock.calls[0][0] as { tokenHash: string }).tokenHash).toBe(sha256(plain));
      expect((requestRepo.save.mock.calls[0][0] as { tokenHash: string }).tokenHash).not.toBe(plain);
    });

    it('debería mandar el link de confirmación al email NUEVO', async () => {
      await build().requestEmailChange('student-uuid', dto);

      const [to, subject, content] = mail.send.mock.calls[0] as [string, string, { html: string }];
      expect(to).toBe('nuevo@gmail.com');
      expect(subject).toContain('Confirmá tu nuevo email');
      expect(content.html).toContain('http://localhost:5173/confirm-email?token=');
      expect(content.html).toContain('1 hora');
    });

    it('debería avisar al email ACTUAL con el nuevo email enmascarado', async () => {
      await build().requestEmailChange('student-uuid', dto);

      expect(mail.send).toHaveBeenCalledTimes(2);
      const [to, , content] = mail.send.mock.calls[1] as [string, string, { html: string }];
      expect(to).toBe('alumno@gmail.com');
      expect(content.html).toContain('nu***@gmail.com');
      expect(content.html).not.toContain('nuevo@gmail.com');
      expect(content.html).not.toContain('token=');
    });

    it('no debería fallar si el aviso al email actual no se puede enviar', async () => {
      mail.send.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('SMTP'));
      await expect(build().requestEmailChange('student-uuid', dto)).resolves.toBeUndefined();
    });

    it('debería registrar el intento ANTES de comparar la contraseña y reiniciar el contador si es correcta', async () => {
      const order: string[] = [];
      attempts.registerAttempt.mockImplementation(() => {
        order.push('register');
        return Promise.resolve({ attemptsRemaining: 4, retryAfterSeconds: 880 });
      });
      (bcrypt.compare as jest.Mock).mockImplementation(() => {
        order.push('compare');
        return Promise.resolve(true);
      });
      attempts.reset.mockImplementation(() => {
        order.push('reset');
        return Promise.resolve();
      });

      await build().requestEmailChange('student-uuid', dto);

      expect(order).toEqual(['register', 'compare', 'reset']);
      expect(attempts.registerAttempt).toHaveBeenCalledWith('student-uuid');
    });

    it('debería lanzar ForbiddenException con los intentos restantes si la contraseña es incorrecta, sin guardar ni enviar nada', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const attempt = build().requestEmailChange('student-uuid', dto);

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject({
        response: { statusCode: 403, attemptsRemaining: 4, retryAfterSeconds: 880 },
      });
      expect(attempts.reset).not.toHaveBeenCalled();
      expect(requestRepo.save).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('debería cortar con 429 sin comparar la contraseña si el alumno está bloqueado', async () => {
      attempts.registerAttempt.mockRejectedValue(
        new HttpException({ statusCode: 429, code: 'PASSWORD_ATTEMPTS_LOCKED' }, 429),
      );

      await expect(build().requestEmailChange('student-uuid', dto)).rejects.toMatchObject({ status: 429 });

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(requestRepo.save).not.toHaveBeenCalled();
    });

    it('debería lanzar NotFoundException si el alumno no existe', async () => {
      studentRepo.findOne.mockResolvedValue(null);
      await expect(build().requestEmailChange('no-existe', dto)).rejects.toThrow(NotFoundException);
    });

    it.each<[AccountStatus, string | null]>([
      [AccountStatus.Suspended, '$2b$10$hashed'],
      [AccountStatus.PendingRegistration, null],
    ])('debería rechazar con 400 (sin gastar intentos) si la cuenta no está activa (%s)', async (status, password) => {
      studentRepo.findOne.mockResolvedValue(makeStudent({ account_status: status, password }));

      await expect(build().requestEmailChange('student-uuid', dto)).rejects.toThrow(BadRequestException);

      expect(attempts.registerAttempt).not.toHaveBeenCalled();
    });

    it('debería rechazar con 400 si el nuevo email es igual al actual (sin importar mayúsculas)', async () => {
      await expect(
        build().requestEmailChange('student-uuid', { password: 'x', newEmail: 'ALUMNO@gmail.com' }),
      ).rejects.toThrow(BadRequestException);
      expect(requestRepo.save).not.toHaveBeenCalled();
    });

    it('debería rechazar con 409 si el email ya lo usa otro alumno', async () => {
      emailInUseCount.mockResolvedValue(1);
      await expect(build().requestEmailChange('student-uuid', dto)).rejects.toThrow(ConflictException);
      expect(requestRepo.save).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('debería invalidar las solicitudes anteriores del alumno antes de guardar la nueva', async () => {
      await build().requestEmailChange('student-uuid', dto);

      expect(requestRepo.delete).toHaveBeenCalledWith({ studentId: 'student-uuid', used: false });
      expect(requestRepo.delete.mock.invocationCallOrder[0]).toBeLessThan(requestRepo.save.mock.invocationCallOrder[0]);
    });

    it('debería borrar la solicitud y fallar con 400 si no se puede enviar el link, sin avisar al email actual', async () => {
      mail.send.mockRejectedValueOnce(new Error('SMTP'));

      await expect(build().requestEmailChange('student-uuid', dto)).rejects.toThrow(BadRequestException);

      expect(requestRepo.delete).toHaveBeenLastCalledWith({ id: 'req-1' });
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('debería escapar el HTML de los datos del alumno en los mails', async () => {
      studentRepo.findOne.mockResolvedValue(makeStudent({ first_name: '<img src=x onerror=alert(1)>' }));

      await build().requestEmailChange('student-uuid', dto);

      for (const call of mail.send.mock.calls as Array<[string, string, { html: string }]>) {
        expect(call[2].html).not.toContain('<img');
        expect(call[2].html).toContain('&lt;img');
      }
    });
  });

  // ── confirmEmailChange ──────────────────────────────────────────────────────

  describe('confirmEmailChange', () => {
    const consumeOk = (request = makeRequest()) => {
      requestRepo.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1, raw: [request] }),
      });
    };
    const consumeFails = () => {
      requestRepo.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      });
    };

    it('debería cambiar el email, cerrar todas las sesiones e invalidar los links de contraseña pendientes en una transacción', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(makeStudent());

      await build().confirmEmailChange('token-plano');

      expect(studentRepo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(fakeManager.update).toHaveBeenCalledWith(StudentEntity, { id: 'student-uuid' }, { email: 'nuevo@gmail.com' });
      expect(refreshTokens.revokeAllForSub).toHaveBeenCalledWith('student-uuid', fakeManager);
      expect(resetTokens.invalidateAllForStudent).toHaveBeenCalledWith('student-uuid', fakeManager);
    });

    it('debería avisar al email anterior (enmascarando el nuevo)', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(makeStudent());

      await build().confirmEmailChange('token-plano');

      expect(mail.send).toHaveBeenCalledTimes(1);
      const [to, subject, content] = mail.send.mock.calls[0] as [string, string, { html: string }];
      expect(to).toBe('alumno@gmail.com');
      expect(subject).toContain('fue cambiado');
      expect(content.html).toContain('nu***@gmail.com');
    });

    it('no debería fallar si el aviso al email anterior no se puede enviar', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(makeStudent());
      mail.send.mockRejectedValue(new Error('SMTP'));

      await expect(build().confirmEmailChange('token-plano')).resolves.toBeUndefined();
    });

    it('debería buscar la solicitud por el hash del token, no por el token', async () => {
      const where = jest.fn().mockReturnThis();
      requestRepo.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where,
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1, raw: [makeRequest()] }),
      });
      studentRepo.findOne.mockResolvedValue(makeStudent());

      await build().confirmEmailChange('token-plano');

      expect(where).toHaveBeenCalledWith('"tokenHash" = :tokenHash', { tokenHash: sha256('token-plano') });
    });

    it('debería lanzar NotFoundException si el token no existe', async () => {
      consumeFails();
      requestRepo.findOne.mockResolvedValue(null);
      await expect(build().confirmEmailChange('x')).rejects.toThrow(NotFoundException);
    });

    it('debería lanzar GoneException si el token ya fue usado', async () => {
      consumeFails();
      requestRepo.findOne.mockResolvedValue(makeRequest({ used: true }));
      await expect(build().confirmEmailChange('x')).rejects.toThrow(GoneException);
    });

    it('debería lanzar GoneException si el token expiró', async () => {
      consumeFails();
      requestRepo.findOne.mockResolvedValue(makeRequest({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(build().confirmEmailChange('x')).rejects.toThrow(GoneException);
    });

    it('debería ser de un solo uso: un segundo intento con el mismo token falla', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(makeStudent());
      const service = build();
      await service.confirmEmailChange('token-plano');

      consumeFails();
      requestRepo.findOne.mockResolvedValue(makeRequest({ used: true }));
      await expect(service.confirmEmailChange('token-plano')).rejects.toThrow(GoneException);
      expect(studentRepo.manager.transaction).toHaveBeenCalledTimes(1);
    });

    it('debería lanzar NotFoundException si el alumno ya no existe', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(null);
      await expect(build().confirmEmailChange('x')).rejects.toThrow(NotFoundException);
      expect(studentRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('debería rechazar con 400 y no cambiar nada si la cuenta ya no está activa', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(makeStudent({ account_status: AccountStatus.Suspended }));

      await expect(build().confirmEmailChange('x')).rejects.toThrow(BadRequestException);

      expect(studentRepo.manager.transaction).not.toHaveBeenCalled();
      expect(refreshTokens.revokeAllForSub).not.toHaveBeenCalled();
    });

    it('debería rechazar con 409 si otro alumno tomó el email mientras tanto', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(makeStudent());
      emailInUseCount.mockResolvedValue(1);

      await expect(build().confirmEmailChange('x')).rejects.toThrow(ConflictException);
      expect(studentRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('debería traducir la violación de unicidad de Postgres (23505) a 409', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(makeStudent());
      studentRepo.manager.transaction.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

      await expect(build().confirmEmailChange('x')).rejects.toThrow(ConflictException);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('debería propagar cualquier otro error de la transacción y no avisar', async () => {
      consumeOk();
      studentRepo.findOne.mockResolvedValue(makeStudent());
      studentRepo.manager.transaction.mockRejectedValue(new Error('db caída'));

      await expect(build().confirmEmailChange('x')).rejects.toThrow('db caída');
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  // ── purgeExpired ────────────────────────────────────────────────────────────

  it('purgeExpired debería borrar solo las solicitudes vencidas', async () => {
    const execute = jest.fn().mockResolvedValue({});
    const where = jest.fn().mockReturnValue({ execute });
    requestRepo.createQueryBuilder.mockReturnValue({ delete: jest.fn().mockReturnValue({ where }) });

    await build().purgeExpired();

    expect(where).toHaveBeenCalledWith('"expiresAt" < :now', { now: expect.any(Date) });
    expect(execute).toHaveBeenCalled();
  });
});