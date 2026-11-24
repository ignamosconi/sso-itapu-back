import { UserInfoOauthDto } from '../../auth/dtos/user-info-oauth.dto.js';

export interface CodeEntry {
  userInfo: UserInfoOauthDto;
  clientId: number;
  /** redirect_uri con la que se emitió el code; /token debe presentar exactamente la misma (RFC 6749 §4.1.3). */
  redirectUri: string;
}

export interface ICodeService {
  generate(userInfo: UserInfoOauthDto, clientId: number, redirectUri: string): Promise<string>;
  /** Devuelve y borra el code en una sola operación atómica (un solo uso). */
  consume(code: string): Promise<CodeEntry | null>;
}
