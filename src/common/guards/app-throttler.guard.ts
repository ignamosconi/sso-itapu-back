import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Endpoints server-to-server de OAuth: los llama el backend de cada app cliente, no un navegador.
const CLIENT_SCOPED = /\/(token|refresh|logout)\/?$/;

/**
 * Throttler global. Por defecto cuenta por IP. En /token, /refresh y /logout cuenta por
 * (client_id + IP) (P6): así el tráfico legítimo de una app no se mezcla con el de otra ni con
 * el ruido de un atacante que usa su mismo client_id desde otra IP.
 * El client_id llega del body sin validar (los guards corren antes que los pipes), así que se
 * normaliza: solo se acepta un entero corto; cualquier otra cosa se agrupa como 'invalid'.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getTracker(req: Record<string, any>): Promise<string> {
    const ip = (req.ip as string | undefined) ?? 'unknown';
    const path = (req.path as string | undefined) ?? '';
    if (req.method === 'POST' && CLIENT_SCOPED.test(path)) {
      const raw = (req.body as { client_id?: unknown } | undefined)?.client_id;
      const clientId = typeof raw === 'string' && /^\d{1,10}$/.test(raw) ? raw : 'invalid';
      return Promise.resolve(`client:${clientId}|${ip}`);
    }
    return Promise.resolve(ip);
  }
}
