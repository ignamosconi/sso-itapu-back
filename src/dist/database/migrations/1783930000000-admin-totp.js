"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminTotp1783930000000 = void 0;
class AdminTotp1783930000000 {
    name = 'AdminTotp1783930000000';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "admins" ADD "totpSecret" character varying`);
        await queryRunner.query(`ALTER TABLE "admins" ADD "totpEnabled" boolean NOT NULL DEFAULT false`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "totpEnabled"`);
        await queryRunner.query(`ALTER TABLE "admins" DROP COLUMN "totpSecret"`);
    }
}
exports.AdminTotp1783930000000 = AdminTotp1783930000000;
//# sourceMappingURL=1783930000000-admin-totp.js.map