"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthClientIsActive1783940000000 = void 0;
class OAuthClientIsActive1783940000000 {
    name = 'OAuthClientIsActive1783940000000';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "oauth_clients" ADD "isActive" boolean NOT NULL DEFAULT true`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "oauth_clients" DROP COLUMN "isActive"`);
    }
}
exports.OAuthClientIsActive1783940000000 = OAuthClientIsActive1783940000000;
//# sourceMappingURL=1783940000000-oauth-client-is-active.js.map