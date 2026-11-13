import { UserInfoOauthDto } from './user-info-oauth.dto.js';
export declare class JwtPayloadDto extends UserInfoOauthDto {
    readonly type: 'access' | 'refresh';
    readonly iat: number;
    readonly exp: number;
}
