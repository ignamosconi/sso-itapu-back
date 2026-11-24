import { AppThrottlerGuard } from './app-throttler.guard.js';

describe('AppThrottlerGuard (P6)', () => {
  // getTracker es protected: se accede por cast, no hace falta levantar Nest.
  const tracker = (req: Record<string, unknown>) =>
    (AppThrottlerGuard.prototype as unknown as { getTracker(r: unknown): Promise<string> }).getTracker(req);

  it('cuenta por IP en endpoints comunes', async () => {
    expect(await tracker({ ip: '1.2.3.4', method: 'POST', path: '/oauth/login', body: { client_id: '1' } })).toBe('1.2.3.4');
  });

  it.each(['token', 'refresh', 'logout'])('cuenta por client_id + IP en /%s', async (route) => {
    expect(await tracker({ ip: '1.2.3.4', method: 'POST', path: `/oauth/${route}`, body: { client_id: '7' } }))
      .toBe('client:7|1.2.3.4');
  });

  it('dos apps distintas desde la misma IP tienen contadores separados', async () => {
    const a = await tracker({ ip: '9.9.9.9', method: 'POST', path: '/oauth/token', body: { client_id: '1' } });
    const b = await tracker({ ip: '9.9.9.9', method: 'POST', path: '/oauth/token', body: { client_id: '2' } });
    expect(a).not.toBe(b);
  });

  it('un client_id raro o enorme se agrupa como invalid (no genera claves arbitrarias)', async () => {
    for (const bad of ['x'.repeat(10000), '1; DROP', 123, undefined, null, {}]) {
      expect(await tracker({ ip: '1.1.1.1', method: 'POST', path: '/oauth/refresh', body: { client_id: bad } }))
        .toBe('client:invalid|1.1.1.1');
    }
  });

  it('tolera un request sin body', async () => {
    expect(await tracker({ ip: '1.1.1.1', method: 'POST', path: '/oauth/token' })).toBe('client:invalid|1.1.1.1');
  });
});
