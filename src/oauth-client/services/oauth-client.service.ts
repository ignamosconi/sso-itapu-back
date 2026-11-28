import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module.js';
import { Injectable, NotFoundException, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from '../../student/students/entities/student.entity.js';
import type { IStudentService } from '../../student/students/services/student.service.interface.js';
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

  /** Autentica a la app (client_id + client_secret) sin mirar redirect_uri. Para /refresh y /logout. */
  async authenticateClient(id: number, secret: string): Promise<boolean> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client || !client.isActive) return false;
    return bcrypt.compare(secret, client.clientSecret);
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
    // de ITAPU, y el sistema es de uso interno.
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
      ['1. Abrir popup de login', html`${code(`${ssoUrl}/sso/login?client_id=${client.id}&redirect_uri=TU_URI&state=ALEATORIO&theme=dark`)}<br>El popup pide usuario y contraseña. Si es la primera vez o no la recuerda, el alumno usa el botón «Es mi primera vez / Olvidé mi contraseña» y recibe un correo para configurarla. Tu ${code('redirect_uri')} tiene que coincidir <strong>exactamente</strong> con una de las registradas arriba, y el popup le muestra al alumno el dominio al que va a volver.<br>Tamaño recomendado del popup: ${code('width=480,height=560')} (en ${code('window.open')}, tercer parámetro).`],
      ['2. Escuchar postMessage', html`Verificá ${code(`event.origin === "${ssoUrl}"`)} y el ${code('state')} antes de procesar. Nunca omitas estas verificaciones.`],
      ['3. Canjear code por tokens', html`${code(`POST ${ssoUrl}/sso/token`)} desde tu <strong>backend</strong> con ${code('client_id')}, ${code('client_secret')}, ${code('code')} y la <strong>misma</strong> ${code('redirect_uri')} que usaste en el login (si es otra, el canje se rechaza). El code es de un solo uso y expira en 2 minutos. Los tokens son JWT con ${code('iss')} = ${code(ssoUrl)} y ${code('aud')} = tu client_id. Esos datos y ${code('exp')} se leen del JWT; la firma no se verifica en tu backend: la comprueba ${code('GET /sso/me')}.`],
      ['4. Identificar al usuario', html`${code(`GET ${ssoUrl}/sso/me`)} con ${code('Authorization: Bearer ACCESS_TOKEN')}. Usá ${code('sub')} como ID único (no cambia nunca). También devuelve ${code('aud')}: tiene que ser tu client_id. ${code('cargos')} y ${code('especialidades')} son <strong>listas</strong> (un usuario puede tener varios cargos y varias especialidades) y reflejan los valores configurados por el administrador. Para dar permisos, verificá si <strong>alguno</strong> de los cargos está en tu lista, por ejemplo ${code(`cargos.includes("Profesor")`)}.`],
      ['5. Renovar tokens', html`${code(`POST ${ssoUrl}/sso/refresh`)} desde tu <strong>backend</strong>, con ${code('client_id')}, ${code('client_secret')} y ${code('refresh_token')}, cuando el access_token expire (cada 15 min). Reemplazá <strong>ambos</strong> tokens con la respuesta (el refresh anterior queda inválido). Si dos pedidos renuevan a la vez con el mismo token, uno recibe 401: usá el token más reciente. Si el alumno fue suspendido o eliminado, también responde 401 y la sesión se revoca.`],
      ['6. Cerrar sesión', html`${code(`POST ${ssoUrl}/sso/logout`)} desde tu <strong>backend</strong>, con ${code('client_id')}, ${code('client_secret')} y ${code('refresh_token')}. También eliminá los tokens del almacenamiento de tu app.`],
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
              html`${label('Endpoints de referencia (públicos)')}Usá estos endpoints para obtener los valores válidos de los elementos de ${code('cargos')} y ${code('especialidades')} que devuelve ${code('/sso/me')}. No hardcodees estos valores en tu app: consultá la API para que tu integración se adapte automáticamente.<div style="margin-top:10px"><strong>⚠️ Estas listas cambian.</strong> El administrador puede agregar, renombrar o eliminar cargos y especialidades en cualquier momento, así que lo que devuelvan hoy puede no ser lo mismo mañana. Volvé a consultarlas cuando las necesites (o guardalas solo por poco tiempo) y no supongas que un valor que tu app usa va a seguir existiendo.</div><div style="margin-top:10px">${code(`GET ${ssoUrl}/sso/info/domain-roles`)}<br><span style="font-size:12px;color:#5B5658">valores posibles de cada cargo</span></div><div style="margin-top:10px">${code(`GET ${ssoUrl}/sso/info/specialties`)}<br><span style="font-size:12px;color:#5B5658">valores posibles de cada especialidad</span></div>`,
            )}
            ${sectionTitle('Integración paso a paso')}
            ${trusted(steps.map(([title, inner]) => stepCard(title, inner).value).join(''))}
            ${sectionTitle('Detalles de integración')}
            ${bulletList([
              html`<strong>Mensaje del popup.</strong> Cuando el login termina, el popup le envía a tu página ${code("{ status: 'success', code, state }")} con ${code('window.opener.postMessage')} y se cierra solo. No redirige a tu ${code('redirect_uri')}: de esa URL solo se usa el <strong>origen</strong>, que tiene que coincidir con el de la página que abrió el popup. Si no coincide, el mensaje no llega.`,
              html`<strong>Respuesta de</strong> ${code('/sso/me')} (siempre vienen completos; ${code('cargos')} y ${code('especialidades')} son listas de textos con al menos un elemento, ordenadas alfabéticamente; el sub es un UUID que no cambia nunca, usalo como ID único del usuario; los valores son de ejemplo): ${code(`{ "sub": "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b", "nombre": "Ana", "apellido": "Pérez", "username": "aperez", "email": "ana@ejemplo.com", "cargos": ["Preceptor", "Profesor"], "especialidades": ["Electrónica", "Mecánica"], "aud": "${client.id}" }`)}`,
              html`<strong>Respuesta de</strong> ${code('/sso/token')} <strong>y</strong> ${code('/sso/refresh')} (status 201): ${code('{ "access_token": "eyJ...", "refresh_token": "eyJ...", "token_type": "Bearer", "expires_in": 900 }')}. El ${code('expires_in')} está en segundos.`,
              html`<strong>Endpoints de referencia.</strong> ${code('/sso/info/domain-roles')} y ${code('/sso/info/specialties')} devuelven una lista de textos, por ejemplo ${code('["Alumno", "Profesor"]')}.`,
              html`<strong>Si el login falla o se cancela.</strong> El popup solo envía el ${code('postMessage')} cuando el login sale bien. Si hay un error, se muestra dentro del popup y no se envía nada; si la persona cierra el popup, tampoco. Para no quedarte esperando, controlá ${code('popup.closed')} (por ejemplo, con un intervalo corto) y mostrá tu propio mensaje.`,
              html`<strong>Tema del popup.</strong> ${code('theme=dark')} o ${code('theme=light')}. Sin ${code('theme')}, o con cualquier otro valor, se usa ${code('dark')}.`,
              html`<strong>Formato de los pedidos.</strong> ${code('/sso/token')}, ${code('/sso/refresh')} y ${code('/sso/logout')} reciben JSON (${code('Content-Type: application/json')}), con el ${code('client_id')} como texto, por ejemplo ${code(`"client_id": "${client.id}"`)}.`,
              html`<strong>Validación de tokens.</strong> Los tokens se firman con HS256 usando una clave que solo tiene el SSO, por lo que no hay claves públicas para verificar la firma en tu app. Para validar un access_token, llamá a ${code('GET /sso/me')} (rechaza los inválidos o vencidos) y comprobá que ${code('aud')} sea tu client_id.`,
              html`<strong>Errores.</strong> ${code('/sso/token')} y ${code('/sso/refresh')} responden <strong>401</strong> con un mensaje en español si el code es inválido, venció o ya se usó, si el secret o la redirect_uri no coinciden, o si el refresh token no sirve; <strong>400</strong> si el cuerpo del pedido es inválido y <strong>429</strong> si superás el límite de pedidos. ${code('/sso/logout')} responde 204 cuando sale bien.`,
              html`<strong>CORS.</strong> ${code('/sso/token')}, ${code('/sso/refresh')}, ${code('/sso/logout')} y ${code('/sso/me')} se llaman desde tu <strong>backend</strong>: el SSO no habilita CORS para otros orígenes. Tu frontend solo abre el popup y escucha el postMessage.`,
              'Qué cargos dan permisos de administración dentro de tu app es una decisión de tu app: configuralo ahí (por ejemplo, por variable de entorno) y no lo dejes fijo en el código. Como un usuario puede tener varios cargos, dale el permiso si ALGUNO de sus cargos está en esa lista.',
              html`<strong>Un usuario puede cambiar de cargo o de especialidad.</strong> Un administrador puede sacarle o agregarle cargos y especialidades en cualquier momento (por ejemplo, un Alumno que pasa a ser Profesor). Tu app los ve actualizados en la próxima renovación del token (${code('/sso/refresh')}, cada 15 minutos como máximo) o en el próximo login: volvé a leer ${code('/sso/me')} después de cada refresh en vez de guardarlos para siempre. Preparate para eso: recalculá los permisos con los cargos nuevos (si ya no tiene el cargo que le daba acceso, sacáselo), no ates datos de tu app a una especialidad como si fuera fija, e identificá siempre al usuario por ${code('sub')}, que es lo único que no cambia.`,
              html`<strong>Cambios en tu cliente.</strong> Para agregar o cambiar Redirect URIs, o si perdés o se filtra el Client Secret, pedíselo a un administrador de ITAPU. Al regenerar el secret, el anterior deja de valer.`,
            ])}
            ${sectionTitle('Gestión de sesión')}
            ${p('La sesión del usuario finaliza automáticamente si:')}
            ${bulletList([
              'El usuario hace logout → tokens revocados en el servidor.',
              'Inactividad de 8 horas sin usar el refresh_token.',
              'Límite absoluto de 3 días desde el primer login.',
              'Reutilización de un refresh_token ya usado (fuera de unos segundos de tolerancia para pedidos simultáneos) → familia completa revocada al instante.',
              'El alumno es suspendido o eliminado → la próxima renovación falla y la sesión se revoca.',
              'El alumno cambia su contraseña → todas sus sesiones se revocan.',
            ])}
            ${sectionTitle('Seguridad')}
            ${callout(
              bulletList([
                'Nunca expongas el Client Secret en el frontend. /sso/token, /sso/refresh y /sso/logout se llaman solo desde tu backend.',
                html`Al recibir un access_token en tu backend verificá ${code('iss')} (la URL del SSO) y ${code('aud')} (tu client_id).`,
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