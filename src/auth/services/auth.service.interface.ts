import { LoginRequestDto } from '../dtos/login-request.dto.js';
import { AuthorizationCodeRequestDto } from '../dtos/authorization-code-request.dto.js';
import { RefreshRequestDto } from '../dtos/refresh-request.dto.js';
import { LogoutRequestDto } from '../dtos/logout-request.dto.js';
import { CodeResponseDto } from '../dtos/code-response.dto.js';
import { TokenResponseDto } from '../dtos/token-response.dto.js';
import { UserInfoOauthDto } from '../dtos/user-info-oauth.dto.js';
import { JwtPayloadDto } from '../dtos/jwt-payload.dto.js';
import { CheckUsernameRequestDto } from '../dtos/check-username-request.dto.js';
import { CheckUsernameResponseDto } from '../dtos/check-username-response.dto.js';
import { SetPasswordRequestDto } from '../dtos/set-password-request.dto.js';
import { RequestPasswordResetRequestDto } from '../dtos/request-password-reset-request.dto.js';
import { ValidateResetTokenRequestDto } from '../dtos/validate-reset-token-request.dto.js';

export interface IAuthService {
  validateAndGetUserInfo(loginDto: LoginRequestDto): Promise<UserInfoOauthDto>;
  issueCode(loginDto: LoginRequestDto): Promise<CodeResponseDto>;
  exchangeCodeForTokens(dto: AuthorizationCodeRequestDto): Promise<TokenResponseDto>;
  refreshTokens(refreshRequestDto: RefreshRequestDto): Promise<TokenResponseDto>;
  logout(dto: LogoutRequestDto): Promise<void>;
  getCleanUserInfo(payload: JwtPayloadDto): UserInfoOauthDto;
  checkUsername(dto: CheckUsernameRequestDto): Promise<CheckUsernameResponseDto>;
  requestPasswordReset(dto: RequestPasswordResetRequestDto): Promise<void>;
  validatePasswordResetToken(dto: ValidateResetTokenRequestDto): Promise<void>;
  setPassword(dto: SetPasswordRequestDto): Promise<void>;
}