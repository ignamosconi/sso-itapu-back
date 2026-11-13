"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtPayloadDto = void 0;
const user_info_oauth_dto_js_1 = require("./user-info-oauth.dto.js");
class JwtPayloadDto extends user_info_oauth_dto_js_1.UserInfoOauthDto {
    type;
    iat;
    exp;
}
exports.JwtPayloadDto = JwtPayloadDto;
//# sourceMappingURL=jwt-payload.dto.js.map