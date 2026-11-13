"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialTokensClientData1783921000000 = void 0;
class CredentialTokensClientData1783921000000 {
    name = 'CredentialTokensClientData1783921000000';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "credential_tokens" ADD "clientName" character varying NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "credential_tokens" ADD "redirectUris" text NOT NULL DEFAULT ''`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "credential_tokens" DROP COLUMN "redirectUris"`);
        await queryRunner.query(`ALTER TABLE "credential_tokens" DROP COLUMN "clientName"`);
    }
}
exports.CredentialTokensClientData1783921000000 = CredentialTokensClientData1783921000000;
//# sourceMappingURL=1783921000000-credential-tokens-client-data.js.map