import { Throttle } from '@nestjs/throttler';

/**
 * Límite para las rutas /admin/* ya autenticadas (N15). Antes tenían @SkipThrottle(): con un token robado
 * (o un script del panel con un bug) no había ningún freno. 300 req/min por IP es holgado para uso humano.
 */
export const AdminThrottle = () => Throttle({ default: { ttl: 60_000, limit: 300 } });
