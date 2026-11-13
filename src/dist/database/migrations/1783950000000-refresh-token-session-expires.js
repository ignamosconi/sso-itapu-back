"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenSessionExpires1783950000000 = void 0;
class RefreshTokenSessionExpires1783950000000 {
    name = 'RefreshTokenSessionExpires1783950000000';
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN "sessionExpiresAt" TIMESTAMP
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      DROP COLUMN "sessionExpiresAt"
    `);
    }
}
exports.RefreshTokenSessionExpires1783950000000 = RefreshTokenSessionExpires1783950000000;
//# sourceMappingURL=1783950000000-refresh-token-session-expires.js.map