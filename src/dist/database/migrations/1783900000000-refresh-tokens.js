"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokens1783900000000 = void 0;
class RefreshTokens1783900000000 {
    name = 'RefreshTokens1783900000000';
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"         uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "tokenHash"  character varying NOT NULL,
        "familyId"   uuid        NOT NULL,
        "sub"        character varying NOT NULL,
        "type"       character varying NOT NULL,
        "used"       boolean     NOT NULL DEFAULT false,
        "revoked"    boolean     NOT NULL DEFAULT false,
        "expiresAt"  TIMESTAMP   NOT NULL,
        "createdAt"  TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_refresh_tokens_tokenHash" UNIQUE ("tokenHash"),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_familyId" ON "refresh_tokens" ("familyId")`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_sub_type" ON "refresh_tokens" ("sub", "type")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_sub_type"`);
        await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_familyId"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    }
}
exports.RefreshTokens1783900000000 = RefreshTokens1783900000000;
//# sourceMappingURL=1783900000000-refresh-tokens.js.map