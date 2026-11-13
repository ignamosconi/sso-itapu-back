"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialTokens1783920000000 = void 0;
class CredentialTokens1783920000000 {
    name = 'CredentialTokens1783920000000';
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE "credential_tokens" (
        "id"              uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "tokenHash"       character varying NOT NULL,
        "oauthClientId"   integer           NOT NULL,
        "encryptedSecret" character varying NOT NULL,
        "used"            boolean           NOT NULL DEFAULT false,
        "expiresAt"       TIMESTAMP         NOT NULL,
        "createdAt"       TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_credential_tokens_tokenHash" UNIQUE ("tokenHash"),
        CONSTRAINT "PK_credential_tokens" PRIMARY KEY ("id")
      )
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_credential_tokens_tokenHash" ON "credential_tokens" ("tokenHash")
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "IDX_credential_tokens_tokenHash"`);
        await queryRunner.query(`DROP TABLE "credential_tokens"`);
    }
}
exports.CredentialTokens1783920000000 = CredentialTokens1783920000000;
//# sourceMappingURL=1783920000000-credential-tokens.js.map