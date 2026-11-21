import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../student/entities/student.entity.js';
import type { IStudentService } from '../../student/services/student.service.interface.js';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { IOAuthClientService } from './oauth-client.service.interface.js';
import type { ICredentialTokenService } from '../../credential-token/services/credential-token.service.interface.js';
import { GenerateCredentialTokenDto } from '../../credential-token/dtos/generate-credential-token.dto.js';
import { OAuthClientEntity } from '../entities/oauth-client.entity.js';
import { CreateOAuthClientDto } from '../dtos/create-oauth-client.dto.js';
import { UpdateOAuthClientDto } from '../dtos/update-oauth-client.dto.js';
import { OAuthClientResponseDto } from '../dtos/oauth-client-response.dto.js';
import { OAuthClientCreatedResponseDto } from '../dtos/oauth-client-created-response.dto.js';
import { OAuthClientInfoDto } from '../dtos/oauth-client-info.dto.js';
import type { IRefreshTokenService } from '../../refresh-token/services/refresh-token.service.interface.js';
import type { IMailService } from '../../mail/services/mail.service.interface.js';
import { ChangeResponsibleUserDto } from '../dtos/change-responsible-user.dto.js';
import { ResponsibleUserResponseDto } from '../dtos/responsible-user-response.dto.js';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class OAuthClientService implements IOAuthClientService {

  constructor(
    @InjectRepository(OAuthClientEntity)
    private readonly clientRepository: Repository<OAuthClientEntity>,
    private readonly configService: ConfigService,
    @Inject('ICredentialTokenService')
    private readonly credentialTokenService: ICredentialTokenService,
    @Inject('IRefreshTokenService')
    private readonly refreshTokenService: IRefreshTokenService,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    @Inject('IMailService')
    private readonly mailService: IMailService,
    @Inject('IStudentService')
    private readonly studentService: IStudentService,
  ) {}


  // TTL del pending secret alineado con CREDENTIAL_TOKEN_TTL_MS (el admin puede
  // tardar en ir a enviar el email). Clave: pending-secret:{clientId}
  private pendingSecretKey(clientId: number, adminId: string): string {
    return `pending-secret:${clientId}:${adminId}`;
  }

  private async storePendingSecret(clientId: number, plainSecret: string, adminId: string): Promise<void> {
    const ttlMs = this.configService.getOrThrow<number>('CREDENTIAL_TOKEN_TTL_MS');
    await this.redis.set(this.pendingSecretKey(clientId, adminId), plainSecret, 'PX', ttlMs);
  }

  private async consumePendingSecret(clientId: number, adminId: string): Promise<string> {
    // GETDEL: atómico, evita que dos requests paralelos lean el mismo secret. 
    const secret = await this.redis.getdel(this.pendingSecretKey(clientId, adminId));
    if (!secret) {
      throw new BadRequestException(
        'El secret ya fue utilizado o expiró. Regenerá el secret para obtener uno nuevo.',
      );
    }
    return secret;
  }

  private censorEmail(email: string): string {
    const [local, domain] = email.split('@');
    const visible = local.substring(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
  }

  private toResponsibleUserDto(student: StudentEntity | null): ResponsibleUserResponseDto | null {
    if (!student) return null;
    return {
      id: student.id,
      username: student.username,
      fullName: `${student.first_name} ${student.last_name}`,
      censoredEmail: this.censorEmail(student.email),
    };
  }

  // Mapea entidad a DTO de respuesta general (sin secret)
  private toResponseDto(entity: OAuthClientEntity): OAuthClientResponseDto {
    return {
      id: entity.id,
      clientName: entity.clientName,
      redirectUris: entity.redirectUris,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      responsibleUser: this.toResponsibleUserDto(entity.responsibleUser),
    };
  }

  // Mapea entidad + plain secret al DTO de creación/regeneración
  private toCreatedResponseDto(entity: OAuthClientEntity): OAuthClientCreatedResponseDto {
    return {
      id: entity.id,
      clientName: entity.clientName,
      redirectUris: entity.redirectUris,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      responsibleUser: this.toResponsibleUserDto(entity.responsibleUser),
    };
  }

  async findAll(): Promise<OAuthClientResponseDto[]> {
    const entities = await this.clientRepository.find();
    return entities.map(e => this.toResponseDto(e));
  }

  async findOne(id: number): Promise<OAuthClientResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
    return this.toResponseDto(client);
  }

  async findInfo(id: number): Promise<OAuthClientInfoDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
    return { clientName: client.clientName };
  }

  async validateClient(id: number, secret: string, redirectUri: string): Promise<boolean> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) return false;
    if (!client.isActive) return false;
    const secretValid = await bcrypt.compare(secret, client.clientSecret);
    if (!secretValid) return false;
    if (!client.redirectUris.includes(redirectUri)) return false;
    return true;
  }

  async create(dto: CreateOAuthClientDto, adminId: string): Promise<OAuthClientCreatedResponseDto> {
    // findOne lanza NotFoundException si no existe — se propaga como 404.
    const student = await this.studentService.findOne(dto.responsibleUserId);
    if (student.account_status !== 'active') {
      throw new BadRequestException(
        'El usuario responsable debe estar activo (no puede estar suspendido ni pendiente de configurar contraseña).',
      );
    }
    const plainSecret = randomBytes(32).toString('hex');
    const clientSecret = await bcrypt.hash(plainSecret, BCRYPT_ROUNDS);
    // responsibleUserId viene del dto (spread), la FK se persiste sola.
    const entity = this.clientRepository.create({ ...dto, clientSecret });
    const saved = await this.clientRepository.save(entity);
    // Recargar para obtener la relación eager (responsibleUser).
    const withRelations = await this.clientRepository.findOneOrFail({ where: { id: saved.id } });
    await this.storePendingSecret(saved.id, plainSecret, adminId);
    return this.toCreatedResponseDto(withRelations);
  }

  async update(id: number, dto: UpdateOAuthClientDto): Promise<OAuthClientResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);

    const changes: Partial<Pick<OAuthClientEntity, 'clientName' | 'redirectUris' | 'responsibleUserId'>> = {};

    // Si se quiere cambiar el responsable, validar que esté activo
    if (dto.responsibleUserId !== undefined) {
      const student = await this.studentService.findOne(dto.responsibleUserId);
      if (student.account_status !== 'active') {
        throw new BadRequestException(
          'El usuario responsable debe estar activo (no puede estar suspendido ni pendiente de configurar contraseña).',
        );
      }
      changes.responsibleUserId = dto.responsibleUserId;
    }

    if (dto.clientName !== undefined) changes.clientName = dto.clientName;
    if (dto.redirectUris !== undefined) changes.redirectUris = dto.redirectUris;

    // update() solo escribe las columnas indicadas. No usamos save() porque la relación
    // eager `responsibleUser` ya cargada (la vieja) pisaría el nuevo responsibleUserId.
    if (Object.keys(changes).length > 0) {
      await this.clientRepository.update({ id }, changes);
    }

    const reloaded = await this.clientRepository.findOneOrFail({ where: { id } });
    return this.toResponseDto(reloaded);
  }

  async remove(id: number): Promise<void> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);

    // Revocar todas las sesiones activas de alumnos antes de eliminar el cliente.
    // LIMITACIÓN CONOCIDA: los access tokens emitidos para esta app seguirán siendo
    // válidos hasta su vencimiento (JWT_ACCESS_EXPIRES_IN, por defecto 15 minutos).
    await this.clientRepository.manager.transaction(async (manager) => {
      await this.refreshTokenService.revokeAllForClient(id, manager);
      await manager.remove(client);
    });
  }

  async regenerateSecret(id: number, adminId: string): Promise<OAuthClientCreatedResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
    const plainSecret = randomBytes(32).toString('hex');
    client.clientSecret = await bcrypt.hash(plainSecret, BCRYPT_ROUNDS);
    const saved = await this.clientRepository.save(client);
    // Sobrescribir el secret anterior en Redis si existía.
    await this.storePendingSecret(saved.id, plainSecret, adminId);
    return this.toCreatedResponseDto(saved);
  }

  async sendCredentialsByEmail(id: number, adminId: string): Promise<void> {

    // Recuperar el secret desde Redis — nunca lo recibimos del frontend.
    // Si el secret ya fue consumido o expiró, el admin debe regenerarlo.
    const plainSecret = await this.consumePendingSecret(id, adminId);

    const credentialTokenTtlMs = this.configService.getOrThrow<number>('CREDENTIAL_TOKEN_TTL_MS');
    const credentialTokenTtlHours = credentialTokenTtlMs / (1000 * 60 * 60);

    //Formateamos para que se vea hora y minuto
    const credentialTokenTtlText = Number.isInteger(credentialTokenTtlHours)
      ? `${credentialTokenTtlHours} hora${credentialTokenTtlHours === 1 ? '' : 's'}`
      : `${credentialTokenTtlHours.toFixed(1)} horas`;

    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
    if (!client.responsibleUser) {
      throw new BadRequestException('Este cliente no tiene usuario responsable asignado.');
    }
    const to = client.responsibleUser.email;

    const ssoUrl = this.configService.getOrThrow<string>('SSO_BASE_URL');

    // Generar link de un solo uso con el secret cifrado

    // LIMITACIÓN CONOCIDA: el plainSecret que llega acá no se valida contra la DB
    // porque el backend nunca almacena el secret en texto plano (solo su hash bcrypt).
    // Un admin podría pasar un plainSecret distinto al real, lo que haría que el
    // destinatario reciba credenciales incorrectas y tenga que volver a solicitarlas.
    // Como mucho un cliente tendría que pedir regenerar el secret, asique no hay impacto
    // de seguridad (no se expone información sensible ni se otorga acceso indebido).
    // Se asume este riesgo porque los administradores del sistema son personal de confianza
    // de UTN FRVM, y el sistema es de uso interno.
    const generateDto = new GenerateCredentialTokenDto();
    Object.assign(generateDto, {
      oauthClientId: client.id,
      plainSecret,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
    });
    const token = await this.credentialTokenService.generate(generateDto);
    const credentialsUrl = `${ssoUrl}/credentials/${token}`;

    try {
      await this.mailService.send(to, `Credenciales OAuth — ${client.clientName}`, {
        html: `
          <!DOCTYPE html>
          <html lang="es">
          <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',Arial,sans-serif">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;padding:40px 0">
              <tr><td align="center">
                <table width="580" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden">

                  <!-- Header -->
                  <tr><td style="background:#f5a705;padding:20px 32px">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#1a1200">SSO ITAPU</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#1a1200;opacity:0.75">Sistema de autenticación único</p>
                  </td></tr>

                  <!-- Body -->
                  <tr><td style="padding:32px">
                    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#ffffff">Credenciales de integración</p>
                    <p style="margin:0 0 24px;font-size:13px;color:rgba(255,255,255,0.6)">
                      Recibiste las credenciales para integrar <strong style="color:#f5a705">${client.clientName}</strong> con el SSO de ITAPU.
                    </p>

                    <!-- Link de un solo uso -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(245,167,5,0.08);border:1px solid rgba(245,167,5,0.3);border-radius:8px;margin-bottom:24px">
                      <tr><td style="padding:16px 20px">
                        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#f5a705;letter-spacing:0.08em;text-transform:uppercase">Tu link de credenciales</p>
                        <a href="${credentialsUrl}" style="color:#f5a705;font-size:13px;word-break:break-all">${credentialsUrl}</a>
                        <p style="margin:10px 0 0;font-size:12px;color:rgba(255,255,255,0.5)">
                          ⚠️ Un solo uso · Expira en ${credentialTokenTtlText} · Guardá el Client Secret en un lugar seguro
                        </p>
                      </td></tr>
                    </table>

                    <!-- Datos del cliente -->
                    <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.08em;text-transform:uppercase">Datos de tu cliente OAuth</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
                      <tr>
                        <td style="padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:4px 4px 0 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;color:rgba(255,255,255,0.4);width:40%">Client ID</td>
                        <td style="padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:4px 4px 0 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;color:#ffffff;font-weight:600">${client.id}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 12px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;color:rgba(255,255,255,0.4)">Nombre</td>
                        <td style="padding:8px 12px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;color:#ffffff">${client.clientName}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:0 0 4px 4px;font-size:12px;color:rgba(255,255,255,0.4);vertical-align:top">Redirect URIs</td>
                        <td style="padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:0 0 4px 4px;font-size:12px;color:#ffffff">${client.redirectUris.map(u => `<span style="display:block">${u}</span>`).join('')}</td>
                      </tr>
                    </table>

                    <!-- Endpoints de referencia -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:8px;margin-bottom:24px">
                      <tr><td style="padding:14px 18px">
                        <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#a5b4fc;letter-spacing:0.08em;text-transform:uppercase">Endpoints de referencia (públicos)</p>
                        <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.6)">
                          Usá estos endpoints para obtener los valores válidos de <code style="color:#f5a705">grupo</code> y <code style="color:#f5a705">carrera</code>
                          que devuelve <code style="color:#f5a705">/sso/me</code>. No hardcodees estos valores en tu app — consultá la API para que tu integración
                          se adapte automáticamente si el administrador agrega o renombra cargos o especialidades.
                        </p>
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
                              <code style="font-size:11px;color:#f5a705">GET ${ssoUrl}/sso/info/domain-roles</code>
                              <span style="font-size:11px;color:rgba(255,255,255,0.4);margin-left:8px">→ valores posibles de <code style="color:#f5a705">grupo</code></span>
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:6px 0">
                              <code style="font-size:11px;color:#f5a705">GET ${ssoUrl}/sso/info/specialties</code>
                              <span style="font-size:11px;color:rgba(255,255,255,0.4);margin-left:8px">→ valores posibles de <code style="color:#f5a705">carrera</code></span>
                            </td>
                          </tr>
                        </table>
                      </td></tr>
                    </table>

                    <!-- Pasos de integración -->
                    <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.08em;text-transform:uppercase">Integración paso a paso</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
                      ${[
                        ['1. Abrir popup de login', `<code style="font-size:11px;color:#f5a705;word-break:break-all">${ssoUrl}/sso/login?client_id=${client.id}&amp;redirect_uri=TU_URI&amp;state=ALEATORIO&amp;theme=dark</code><br><span style="font-size:11px;color:rgba(255,255,255,0.4)">El popup pide usuario y contraseña. Si el usuario no configuró contraseña, el SSO le envía un email automáticamente.</span>`],
                        ['2. Escuchar postMessage', `Verificá <code style="color:#f5a705">event.origin === "${ssoUrl}"</code> y el <code style="color:#f5a705">state</code> antes de procesar. Nunca omitas estas verificaciones.`],
                        ['3. Canjear code por tokens', `<code style="font-size:11px;color:#f5a705">POST ${ssoUrl}/sso/token</code> — desde tu <strong>backend</strong> con client_secret. El code es de un solo uso y expira en 2 minutos.`],
                        ['4. Identificar al usuario', `<code style="font-size:11px;color:#f5a705">GET ${ssoUrl}/sso/me</code> con <code style="color:#f5a705">Authorization: Bearer ACCESS_TOKEN</code>. Usá <code style="color:#f5a705">sub</code> como ID único — no cambia nunca. Los campos <code style="color:#f5a705">cargo</code> y <code style="color:#f5a705">especialidad</code> reflejan los valores configurados por el administrador.`],
                        ['5. Renovar tokens', `<code style="font-size:11px;color:#f5a705">POST ${ssoUrl}/sso/refresh</code> cuando el access_token expire (cada 15 min). Reemplazá <strong>ambos</strong> tokens con la respuesta — el refresh anterior queda inválido.`],
                        ['6. Cerrar sesión', `<code style="font-size:11px;color:#f5a705">POST ${ssoUrl}/sso/logout</code> con el refresh_token. También eliminá los tokens del almacenamiento de tu app.`],
                      ].map(([title, body]) => `
                        <tr><td style="padding:0 0 8px">
                          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.03);border-radius:6px">
                            <tr><td style="padding:12px 16px">
                              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#ffffff">${title}</p>
                              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.6">${body}</p>
                            </td></tr>
                          </table>
                        </td></tr>
                      `).join('')}
                    </table>

                    <!-- Gestión de sesión -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(20,184,166,0.08);border:1px solid rgba(20,184,166,0.25);border-radius:8px;margin-bottom:24px">
                      <tr><td style="padding:14px 18px">
                        <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#5eead4;letter-spacing:0.06em;text-transform:uppercase">Gestión de sesión</p>
                        <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.6)">La sesión del usuario finaliza automáticamente si:</p>
                        <ul style="margin:0;padding-left:16px;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.8">
                          <li>El usuario hace logout → tokens revocados en el servidor.</li>
                          <li>Inactividad de 8 horas sin usar el refresh_token.</li>
                          <li>Límite absoluto de 3 días desde el primer login.</li>
                          <li>Reutilización de un refresh_token ya usado → familia completa revocada al instante.</li>
                        </ul>
                      </td></tr>
                    </table>

                    <!-- Seguridad -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px">
                      <tr><td style="padding:14px 18px">
                        <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#fc9797;letter-spacing:0.06em;text-transform:uppercase">Seguridad</p>
                        <ul style="margin:0;padding-left:16px;font-size:12px;color:rgba(255,255,255,0.55);line-height:1.8">
                          <li>Nunca expongas el Client Secret en el frontend.</li>
                          <li>Guardá los tokens en cookies <code style="color:#f5a705">HttpOnly</code> o en el backend — nunca en localStorage.</li>
                          <li>El authorization code es de un solo uso y expira en 2 minutos.</li>
                          <li>Verificá siempre <code style="color:#f5a705">event.origin</code> y <code style="color:#f5a705">state</code> en el postMessage.</li>
                          <li>Si perdés el Client Secret, pedile al administrador que lo regenere.</li>
                        </ul>
                      </td></tr>
                    </table>
                  </td></tr>

                  <!-- Footer -->
                  <tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06)">
                    <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center">
                      SSO ITAPU · Este correo fue generado automáticamente, no respondas a esta dirección.
                    </p>
                  </td></tr>

                </table>
              </td></tr>
            </table>
          </body>
          </html>`,

      });
    } catch {
      throw new BadRequestException('Error al enviar el correo. Verificá la configuración de email.');
    }
  }

  async changeResponsibleUser(id: number, dto: ChangeResponsibleUserDto): Promise<OAuthClientResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
    const student = await this.studentService.findOne(dto.responsibleUserId);
    if (student.account_status !== 'active') {
      throw new BadRequestException(
        'El usuario responsable debe estar activo (no puede estar suspendido ni pendiente de configurar contraseña).',
      );
    }
    await this.clientRepository.update({ id }, { responsibleUserId: dto.responsibleUserId });
    const reloaded = await this.clientRepository.findOneOrFail({ where: { id } });
    return this.toResponseDto(reloaded);
  }

  async suspend(id: number): Promise<OAuthClientResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);

    // Revocar todas las sesiones activas de alumnos al suspender el cliente.
    // LIMITACIÓN CONOCIDA: los access tokens emitidos para esta app seguirán siendo
    // válidos hasta su vencimiento (JWT_ACCESS_EXPIRES_IN, por defecto 15 minutos).
    await this.refreshTokenService.revokeAllForClient(id);

    client.isActive = false;
    const saved = await this.clientRepository.save(client);
    return this.toResponseDto(saved);
  }

  async activate(id: number): Promise<OAuthClientResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
    client.isActive = true;
    const saved = await this.clientRepository.save(client);
    return this.toResponseDto(saved);
  }
}