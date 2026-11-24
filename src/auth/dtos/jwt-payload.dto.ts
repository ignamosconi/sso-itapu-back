//No se documenta porque es estructura interna. Al consultar /me se muestra UserInfoOauthDto, que es lo importante.
import { UserInfoOauthDto } from './user-info-oauth.dto.js';

export class JwtPayloadDto extends UserInfoOauthDto {
  readonly type!: 'access' | 'refresh';
  readonly iat!: number;
  readonly exp!: number;
  /** Emisor: la URL base de este SSO. */
  readonly iss!: string;
  /** Audiencia: el client_id de la app para la que se emitió el token. */
  readonly aud!: string;
}