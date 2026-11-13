"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminUsernameLength1783970000000 = void 0;
class AdminUsernameLength1783970000000 {
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "admins"
        ALTER COLUMN "username" TYPE varchar(32)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE "admins"
        ALTER COLUMN "username" TYPE varchar(255)
    `);
    }
}
exports.AdminUsernameLength1783970000000 = AdminUsernameLength1783970000000;
//# sourceMappingURL=1783970000000-admin-username-length.js.map