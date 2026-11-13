"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenClientId1783960000000 = void 0;
class RefreshTokenClientId1783960000000 {
    name = 'RefreshTokenClientId1783960000000';
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN "clientId" INTEGER
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      DROP COLUMN "clientId"
    `);
    }
}
exports.RefreshTokenClientId1783960000000 = RefreshTokenClientId1783960000000;
//# sourceMappingURL=1783960000000-refresh-token-client-id.js.map