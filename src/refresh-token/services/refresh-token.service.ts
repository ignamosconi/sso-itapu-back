import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { RefreshTokenEntity } from '../entities/refresh-token.entity.js';
import { IRefreshTokenService, SaveRefreshTokenParams } from './refresh-token.service.interface.js';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Ventana en la que un segundo uso del MISMO refresh token no se considera robo (P9).
 * Cubre dos pestañas / dos requests del mismo cliente que renuevan a la vez: antes la segunda
 * request revocaba toda la sesión. Dentro de la ventana la segunda se rechaza (401) pero la sesión
 * sigue viva con el token que emitió la primera. Fuera de la ventana, la reutilización revoca la familia.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

@Injectable()
export class RefreshTokenService implements IRefreshTokenService {

  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repo: Repository<RefreshTokenEntity>,
  ) {}

  // Hashea el token para guardarlo en DB (nunca guardamos el token en claro)
  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Parsea el string de expiración (ej: "1d", "7d", "15m") a una Date
  private toDate(expiresIn: string): Date {
    const unit = expiresIn.slice(-1);
    const amount = parseInt(expiresIn.slice(0, -1), 10);
    const ms = unit === 's' ? amount * 1000
              : unit === 'm' ? amount * 60 * 1000
              : unit === 'h' ? amount * 60 * 60 * 1000
              : unit === 'd' ? amount * 60 * 60 * 24 * 1000
              : parseInt(expiresIn, 10) * 1000;
    return new Date(Date.now() + ms);
  }

  // Guarda un nuevo refresh token. Si no se pasa familyId, inicia una nueva familia.
  async save(params: SaveRefreshTokenParams): Promise<void> {
    await this.repo.save({
      tokenHash: this.hash(params.token),
      familyId: params.familyId ?? randomUUID(),
      sub: params.sub,
      type: params.type,
      expiresAt: this.toDate(params.expiresIn),
      sessionExpiresAt: params.sessionExpiresAt ?? null,
      clientId: params.clientId ?? null,
    });
  }

  // Valida el token y devuelve el registro. Maneja detección de reutilización.
  async consume(token: string): Promise<RefreshTokenEntity> {
    const tokenHash = this.hash(token);

    // Atómicamente marca el token como usado solo si todavía no lo fue
    // y no está revocado. Solo una query concurrente puede ganar esto.
    const result = await this.repo
      .createQueryBuilder()
      .update(RefreshTokenEntity)
      .set({ used: true, usedAt: new Date() })
      .where('tokenHash = :tokenHash', { tokenHash })
      .andWhere('used = false')
      .andWhere('revoked = false')
      .returning('*')
      .execute();

    // Ninguna fila actualizada: el token no existe, ya fue usado, o está revocado.
    // Necesitamos distinguir "ya usado" (posible robo) de "no existe / revocado".
    if (result.affected === 0) {
      // Buscar el registro para saber qué pasó y actuar en consecuencia
      const existing = await this.repo.findOne({ where: { tokenHash } });

      if (existing?.used) {
        // Segundo uso casi simultáneo (carrera legítima): no se revoca la sesión.
        if (!existing.revoked && existing.usedAt && Date.now() - new Date(existing.usedAt).getTime() <= REFRESH_REUSE_GRACE_MS) {
          throw new UnauthorizedException('El refresh token ya fue renovado hace instantes. Usá el token más reciente.');
        }
        // Reutilización detectada → revocar toda la familia
        await this.repo.update({ familyId: existing.familyId }, { revoked: true });
        throw new UnauthorizedException('Refresh token ya utilizado. Sesión revocada por seguridad.');
      }

      // No existe, revocado, o expirado  mismo mensaje hacia el cliente
      throw new UnauthorizedException('Refresh token inválido o revocado.');
    }

    const raw = result.raw as RefreshTokenEntity[];
    const record = raw[0];
    const now = new Date();

    // Verificar expiración por inactividad
    if (new Date(record.expiresAt) < now) {
      await this.repo.update({ familyId: record.familyId }, { revoked: true });
      throw new UnauthorizedException('Refresh token expirado.');
    }

    // Verificar expiración absoluta de sesión (solo tokens de alumno)
    if (record.sessionExpiresAt && new Date(record.sessionExpiresAt) < now) {
      await this.repo.update({ familyId: record.familyId }, { revoked: true });
      throw new UnauthorizedException('La sesión expiró. Volvé a iniciar sesión.');
    }

    return record;
  }

  // Revoca toda la familia (logout)
  // Si se pasa clientId, solo revoca cuando el token pertenece a esa app.
  async revokeFamily(token: string, clientId?: number): Promise<void> {
    const tokenHash = this.hash(token);
    const record = await this.repo.findOne({ where: { tokenHash } });
    if (!record) return;
    if (clientId !== undefined && record.clientId !== clientId) return;
    await this.repo.update({ familyId: record.familyId }, { revoked: true });
  }

  async revokeAllForSub(sub: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(RefreshTokenEntity) : this.repo;
    await repo.update({ sub, revoked: false }, { revoked: true });
  }

  // Revoca todos los refresh tokens activos de alumnos asociados a la app OAuth.
  // LIMITACIÓN CONOCIDA: los access tokens emitidos para esa app seguirán siendo
  // válidos hasta su vencimiento natural (JWT_ACCESS_EXPIRES_IN, por defecto 15 minutos).
  // Se asume esta ventana como aceptable para evitar mantener una blacklist de JWT
  // o consultar el estado del cliente en cada request.
  async revokeAllForClient(clientId: number, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(RefreshTokenEntity) : this.repo;
    await repo.update(
      { clientId, revoked: false },
      { revoked: true },
    );
  }

  //Agregamos un cron-job para limpiar la tabla de refresh-tokens
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .delete()
      .where('"expiresAt" < :now', { now: new Date() })
      .execute();
  }
}