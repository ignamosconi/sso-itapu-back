import { HttpException } from '@nestjs/common';
import {
  PasswordAttemptsService,
  PASSWORD_ATTEMPTS_LOCKED_CODE,
} from './password-attempts.service.js';

function makeService(env: Record<string, string> = {}) {
  const redis = { eval: jest.fn(), get: jest.fn(), ttl: jest.fn(), del: jest.fn().mockResolvedValue(1) };
  const config = { get: (key: string) => env[key] };
  const service = new PasswordAttemptsService(redis as never, config as never);
  return { redis, service };
}

describe('PasswordAttemptsService', () => {
  describe('configuración', () => {
    it('debería usar 5 intentos y 15 minutos si no hay variables de entorno', async () => {
      const { redis, service } = makeService();
      redis.eval.mockResolvedValueOnce([1, 900]);

      await service.registerAttempt('stu-1');

      expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'student:password-attempts:stu-1', 900, 5);
    });

    it('debería tomar el máximo y la duración del entorno (ms → segundos, redondeando hacia arriba)', async () => {
      const { redis, service } = makeService({
        STUDENT_PASSWORD_MAX_ATTEMPTS: '3',
        STUDENT_PASSWORD_LOCK_TTL_MS: '60500',
      });
      redis.eval.mockResolvedValueOnce([1, 61]);

      await service.registerAttempt('stu-1');

      expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, 'student:password-attempts:stu-1', 61, 3);
    });

    it.each([['abc'], ['0'], ['-2'], ['2.5']])('debería fallar al arrancar si el valor es inválido (%s)', (bad) => {
      expect(() => makeService({ STUDENT_PASSWORD_MAX_ATTEMPTS: bad })).toThrow('STUDENT_PASSWORD_MAX_ATTEMPTS');
      expect(() => makeService({ STUDENT_PASSWORD_LOCK_TTL_MS: bad })).toThrow('STUDENT_PASSWORD_LOCK_TTL_MS');
    });
  });

  describe('registerAttempt', () => {
    it('debería permitir hasta el máximo de intentos e informar cuántos quedan', async () => {
      const { redis, service } = makeService();
      redis.eval.mockResolvedValueOnce([1, 800]).mockResolvedValueOnce([5, 900]);

      await expect(service.registerAttempt('stu-1')).resolves.toEqual({ attemptsRemaining: 4, retryAfterSeconds: 800 });
      await expect(service.registerAttempt('stu-1')).resolves.toEqual({ attemptsRemaining: 0, retryAfterSeconds: 900 });
    });

    it('debería lanzar 429 con code y segundos de espera al superar el máximo', async () => {
      const { redis, service } = makeService();
      redis.eval.mockResolvedValueOnce([6, 421]);

      const attempt = service.registerAttempt('stu-1');

      await expect(attempt).rejects.toBeInstanceOf(HttpException);
      await expect(attempt).rejects.toMatchObject({
        status: 429,
        response: { statusCode: 429, code: PASSWORD_ATTEMPTS_LOCKED_CODE, retryAfterSeconds: 421 },
      });
    });

    it('debería usar la ventana completa como espera si Redis no devuelve un TTL válido', async () => {
      const { redis, service } = makeService();
      redis.eval.mockResolvedValueOnce([6, -1]);

      await expect(service.registerAttempt('stu-1')).rejects.toMatchObject({
        response: expect.objectContaining({ retryAfterSeconds: 900 }),
      });
    });

    it('debería propagar el error si Redis falla (no permite el intento)', async () => {
      const { redis, service } = makeService();
      redis.eval.mockRejectedValueOnce(new Error('Redis caído'));
      await expect(service.registerAttempt('stu-1')).rejects.toThrow('Redis caído');
    });
  });

  describe('getLockStatus', () => {
    it('debería informar que no está bloqueado si no hay intentos registrados', async () => {
      const { redis, service } = makeService();
      redis.get.mockResolvedValue(null);
      redis.ttl.mockResolvedValue(-2);

      await expect(service.getLockStatus('stu-1')).resolves.toEqual({ locked: false, retryAfterSeconds: 0 });
    });

    it('debería informar que no está bloqueado mientras queden intentos', async () => {
      const { redis, service } = makeService();
      redis.get.mockResolvedValue('4');
      redis.ttl.mockResolvedValue(500);

      await expect(service.getLockStatus('stu-1')).resolves.toEqual({ locked: false, retryAfterSeconds: 0 });
    });

    it('debería informar bloqueo y espera cuando ya usó todos los intentos', async () => {
      const { redis, service } = makeService();
      redis.get.mockResolvedValue('5');
      redis.ttl.mockResolvedValue(733);

      await expect(service.getLockStatus('stu-1')).resolves.toEqual({ locked: true, retryAfterSeconds: 733 });
    });

    it('no debería consumir intentos (no usa eval)', async () => {
      const { redis, service } = makeService();
      redis.get.mockResolvedValue('5');
      redis.ttl.mockResolvedValue(10);
      await service.getLockStatus('stu-1');
      expect(redis.eval).not.toHaveBeenCalled();
    });
  });

  it('reset debería borrar el contador del alumno', async () => {
    const { redis, service } = makeService();
    await service.reset('stu-1');
    expect(redis.del).toHaveBeenCalledWith('student:password-attempts:stu-1');
  });
});