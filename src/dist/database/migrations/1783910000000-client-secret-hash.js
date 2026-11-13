"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientSecretHash1783910000000 = void 0;
class ClientSecretHash1783910000000 {
    name = 'ClientSecretHash1783910000000';
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "oauth_clients"
      ALTER COLUMN "clientSecret" TYPE character varying(100)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "oauth_clients"
      ALTER COLUMN "clientSecret" TYPE character varying
    `);
    }
}
exports.ClientSecretHash1783910000000 = ClientSecretHash1783910000000;
//# sourceMappingURL=1783910000000-client-secret-hash.js.map