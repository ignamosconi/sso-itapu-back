import { Request as ExpressRequest } from 'express';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AdminEntity } from '../../admin/entities/admin.entity.js';
import { AdminJwtPayloadDto } from '../../admin-auth/dtos/admin-jwt-payload.dto.js';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    // DataSource está disponible globalmente: el guard puede usarse en cualquier módulo sin importar el repo de admins.
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ExpressRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de admin no proporcionado.');
    }

    const token = authHeader.split(' ')[1];
    let payload: AdminJwtPayloadDto;

    try {
      payload = await this.jwtService.verifyAsync<AdminJwtPayloadDto>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ADMIN_ACCESS_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Token de admin inválido o expirado.');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token de admin inválido o expirado.');
    }

    // X3: un token firmado vale mientras viva, pero si el admin fue eliminado ya no debe poder operar.
    const stillExists = await this.dataSource.getRepository(AdminEntity).exists({ where: { id: payload.sub } });
    if (!stillExists) {
      throw new UnauthorizedException('Token de admin inválido o expirado.');
    }

    (context.switchToHttp().getRequest<ExpressRequest & { admin: AdminJwtPayloadDto }>()).admin = payload;
    return true;
  }
}