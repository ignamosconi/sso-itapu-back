import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { Injectable, NotFoundException, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../student/entities/student.entity.js';
import type { IStudentService } from '../../student/services/student.service.interface.js';
import { html, trusted } from '../../mail/utils/email-html.js';
import { bulletList, callout, code, emailLayout, keyValueTable, label, p, sectionTitle, stepCard } from '../../mail/utils/email-layout.js';
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

const CLIENT_NAME_UNIQUE_INDEX = 'UQ_oauth_clients_client_name_normalized';
const CLIENT_NAME_TAKEN_MESSAGE = 'Ya existe una aplicación con ese nombre.';

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

  // Ignora mayúsculas, tildes y espacios en los extremos. Esta expresión debe coincidir con la
  // del índice único (migración OAuthClientNameUnique) para que Postgres lo use.
  private async assertClientNameAvailable(name: string, excludeId?: number): Promise<void> {
    const qb = this.clientRepository
      .createQueryBuilder('c')
      .where('lower(immutable_unaccent(btrim(c.clientName))) = lower(immutable_unaccent(btrim(:name)))', { name });
    if (excludeId !== undefined) qb.andWhere('c.id != :excludeId', { excludeId });
    if ((await qb.getCount()) > 0) throw new ConflictException(CLIENT_NAME_TAKEN_MESSAGE);
  }

  // Dos pedidos simultáneos pueden pasar el chequeo anterior; el índice único es la red de seguridad.
  private isClientNameConflict(err: unknown): boolean {
    const e = err as { code?: string; constraint?: string; driverError?: { code?: string; constraint?: string } };
    const pgCode = e?.driverError?.code ?? e?.code;
    const constraint = e?.driverError?.constraint ?? e?.constraint;
    return pgCode === '23505' && constraint === CLIENT_NAME_UNIQUE_INDEX;
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

  async findInfo(id: number, redirectUri?: string): Promise<OAuthClientInfoDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);
    return {
      clientName: client.clientName,
      isActive: client.isActive,
      redirectUriValid:
        redirectUri === undefined ? undefined : client.redirectUris.includes(redirectUri),
    };
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
    await this.assertClientNameAvailable(dto.clientName);
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
    let saved: OAuthClientEntity;
    try {
      saved = await this.clientRepository.save(entity);
    } catch (err) {
      if (this.isClientNameConflict(err)) throw new ConflictException(CLIENT_NAME_TAKEN_MESSAGE);
      throw err;
    }
    // Recargar para obtener la relación eager (responsibleUser).
    const withRelations = await this.clientRepository.findOneOrFail({ where: { id: saved.id } });
    await this.storePendingSecret(saved.id, plainSecret, adminId);
    return this.toCreatedResponseDto(withRelations);
  }

  async update(id: number, dto: UpdateOAuthClientDto): Promise<OAuthClientResponseDto> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException(`Cliente OAuth con id ${id} no encontrado.`);

    if (dto.clientName !== undefined) await this.assertClientNameAvailable(dto.clientName, id);

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
      try {
        await this.clientRepository.update({ id }, changes);
      } catch (err) {
        if (this.isClientNameConflict(err)) throw new ConflictException(CLIENT_NAME_TAKEN_MESSAGE);
        throw err;
      }
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

    const steps: Array<[string, string]> = [
      ['1. Abrir popup de login', html`${code(`${ssoUrl}/sso/login?client_id=${client.id}&redirect_uri=TU_URI&state=ALEATORIO&theme=dark`)}<br>El popup pide usuario y contraseña. Si el usuario no configuró contraseña, el SSO le envía un email automáticamente.`],
      ['2. Escuchar postMessage', html`Verificá ${code(`event.origin === "${ssoUrl}"`)} y el ${code('state')} antes de procesar. Nunca omitas estas verificaciones.`],
      ['3. Canjear code por tokens', html`${code(`POST ${ssoUrl}/sso/token`)} desde tu <strong>backend</strong> con client_secret. El code es de un solo uso y expira en 2 minutos.`],
      ['4. Identificar al usuario', html`${code(`GET ${ssoUrl}/sso/me`)} con ${code('Authorization: Bearer ACCESS_TOKEN')}. Usá ${code('sub')} como ID único (no cambia nunca). Los campos ${code('cargo')} y ${code('especialidad')} reflejan los valores configurados por el administrador.`],
      ['5. Renovar tokens', html`${code(`POST ${ssoUrl}/sso/refresh`)} cuando el access_token expire (cada 15 min). Reemplazá <strong>ambos</strong> tokens con la respuesta (el refresh anterior queda inválido).`],
      ['6. Cerrar sesión', html`${code(`POST ${ssoUrl}/sso/logout`)} con el refresh_token. También eliminá los tokens del almacenamiento de tu app.`],
    ];

    try {
      await this.mailService.send(to, `Credenciales OAuth — ${client.clientName}`, {
        html: emailLayout({
          title: 'Credenciales de integración',
          body: html`
            ${p(html`Recibiste las credenciales para integrar <strong>${client.clientName}</strong> con el SSO de ITAPU.`)}
            ${callout(
              html`${label('Tu link de credenciales')}<a href="${credentialsUrl}" style="color:#1E3C92;word-break:break-all">${credentialsUrl}</a><br><span style="font-size:12px;color:#5B5658">⚠️ Un solo uso · Expira en ${credentialTokenTtlText} · Guardá el Client Secret en un lugar seguro</span>`,
              'info',
            )}
            ${sectionTitle('Datos de tu cliente OAuth')}
            ${keyValueTable([
              ['Client ID', html`<strong>${client.id}</strong>`],
              ['Nombre', html`${client.clientName}`],
              ['Redirect URIs', client.redirectUris.map((u) => html`<span style="display:block">${u}</span>`).join('')],
            ])}
            ${callout(
              html`${label('Endpoints de referencia (públicos)')}Usá estos endpoints para obtener los valores válidos de ${code('grupo')} y ${code('carrera')} que devuelve ${code('/sso/me')}. No hardcodees estos valores en tu app: consultá la API para que tu integración se adapte automáticamente si el administrador agrega o renombra cargos o especialidades.<div style="margin-top:10px">${code(`GET ${ssoUrl}/sso/info/domain-roles`)}<br><span style="font-size:12px;color:#5B5658">valores posibles de grupo</span></div><div style="margin-top:10px">${code(`GET ${ssoUrl}/sso/info/specialties`)}<br><span style="font-size:12px;color:#5B5658">valores posibles de carrera</span></div>`,
            )}
            ${sectionTitle('Integración paso a paso')}
            ${trusted(steps.map(([title, inner]) => stepCard(title, inner).value).join(''))}
            ${sectionTitle('Gestión de sesión')}
            ${p('La sesión del usuario finaliza automáticamente si:')}
            ${bulletList([
              'El usuario hace logout → tokens revocados en el servidor.',
              'Inactividad de 8 horas sin usar el refresh_token.',
              'Límite absoluto de 3 días desde el primer login.',
              'Reutilización de un refresh_token ya usado → familia completa revocada al instante.',
            ])}
            ${sectionTitle('Seguridad')}
            ${callout(
              bulletList([
                'Nunca expongas el Client Secret en el frontend.',
                html`Guardá los tokens en cookies ${code('HttpOnly')} o en el backend, nunca en localStorage.`,
                'El authorization code es de un solo uso y expira en 2 minutos.',
                html`Verificá siempre ${code('event.origin')} y ${code('state')} en el postMessage.`,
                'Si perdés el Client Secret, pedile al administrador que lo regenere.',
              ]).value,
              'danger',
            )}
          `,
        }),
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