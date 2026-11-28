jest.mock('bcrypt', () => ({ compare: jest.fn() }));

import { ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  AdminPasswordConfirmService,
  ADMIN_PASSWORD_ATTEMPTS_LOCKED_CODE,
} from './admin-password-confirm.service.js';

function makeService(env: Record<string, string> = {}) {
  const redis = { eval: jest.fn(), del: jest.fn().mockResolvedValue(1) };
  const adminRepo = { findOne: jest.fn().mockResolvedValue({ id: 'admin-1', password: '$2b$12$hash' }) };
  const config = { get: (key: string) => env[key] };
  const service = new AdminPasswordConfirmService(adminRepo as never, redis as never, config as never);
  return { redis, adminRepo, service };
}

describe('AdminPasswordConfirmService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('configuración', () => {
    it('usa 5 intentos y 15 minutos por defecto, con una clave por admin', async () => {
      const { redis, service } = makeService();
      redis.eval.mockResolvedValueOnce([1, 900]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.verify('admin-1', 'ok');

      expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'admin:confirm-password-attempts:admin-1', 900, 5);
    });

    it('toma los valores del entorno', async () => {
      const { redis, service } = makeService({
        ADMIN_CONFIRM_PASSWORD_MAX_ATTEMPTS: '3',
        ADMIN_CONFIRM_PASSWORD_LOCK_TTL_MS: '60000',
      });
      redis.eval.mockResolvedValueOnce([1, 60]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.verify('admin-1', 'ok');

      expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'admin:confirm-password-attempts:admin-1', 60, 3);
    });

    it.each([['abc'], ['0'], ['-1'], ['1.5']])('no arranca con un valor inválido (%s)', (bad) => {
      expect(() => makeService({ ADMIN_CONFIRM_PASSWORD_MAX_ATTEMPTS: bad })).toThrow('ADMIN_CONFIRM_PASSWORD_MAX_ATTEMPTS');
      expect(() => makeService({ ADMIN_CONFIRM_PASSWORD_LOCK_TTL_MS: bad })).toThrow('ADMIN_CONFIRM_PASSWORD_LOCK_TTL_MS');
    });
  });

  describe('verify', () => {
    it('con la contraseña correcta reinicia el contador', async () => {
      const { redis, service } = makeService();
      redis.eval.mockResolvedValueOnce([2, 800]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.verify('admin-1', 'ok')).resolves.toBeUndefined();
      expect(bcrypt.compare).toHaveBeenCalledWith('ok', '$2b$12$hash');
      expect(redis.del).toHaveBeenCalledWith('admin:confirm-password-attempts:admin-1');
    });

    it('con la contraseña incorrecta responde 403 (no 401) con los intentos restantes y no reinicia', async () => {
      const { redis, service } = makeService();
      redis.eval.mockResolvedValueOnce([2, 800]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const err = await service.verify('admin-1', 'mal').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({ attemptsRemaining: 3, retryAfterSeconds: 800 });
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('registra el intento ANTES de comparar y, bloqueado, corta con 429 sin ejecutar bcrypt', async () => {
      const { redis, adminRepo, service } = makeService();
      redis.eval.mockResolvedValueOnce([6, 500]);

      const err = await service.verify('admin-1', 'x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
      expect((err as HttpException).getResponse()).toMatchObject({ code: ADMIN_PASSWORD_ATTEMPTS_LOCKED_CODE, retryAfterSeconds: 500 });
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(adminRepo.findOne).not.toHaveBeenCalled();
    });

    it('si el admin ya no existe responde 401', async () => {
      const { redis, adminRepo, service } = makeService();
      redis.eval.mockResolvedValueOnce([1, 900]);
      adminRepo.findOne.mockResolvedValue(null);
      await expect(service.verify('admin-x', 'x')).rejects.toThrow(UnauthorizedException);
    });
  });
});
