"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentsDomainRolesSpecialties1783980000000 = void 0;
class StudentsDomainRolesSpecialties1783980000000 {
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TABLE "domain_roles" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(64) UNIQUE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
        await queryRunner.query(`
      CREATE TABLE "specialties" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(64) UNIQUE NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
        await queryRunner.query(`
      CREATE TYPE account_status_enum AS ENUM ('active', 'suspended', 'pending_registration')
    `);
        await queryRunner.query(`
      CREATE TABLE "students" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "first_name" VARCHAR(64) NOT NULL,
        "last_name" VARCHAR(64) NOT NULL,
        "username" VARCHAR(64) UNIQUE NOT NULL,
        "email" VARCHAR(255) UNIQUE NOT NULL,
        "password" VARCHAR,
        "dni" INTEGER UNIQUE NOT NULL,
        "birth_date" DATE NOT NULL,
        "domain_role_id" INTEGER NOT NULL,
        "specialty_id" INTEGER NOT NULL,
        "account_status" account_status_enum NOT NULL DEFAULT 'pending_registration',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_student_domain_role" FOREIGN KEY ("domain_role_id") REFERENCES "domain_roles"("id"),
        CONSTRAINT "FK_student_specialty" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id")
      )
    `);
        await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "tokenHash" VARCHAR UNIQUE NOT NULL,
        "studentId" UUID NOT NULL,
        "purpose" VARCHAR NOT NULL,
        "used" BOOLEAN NOT NULL DEFAULT false,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
        await queryRunner.query(`CREATE INDEX "IDX_prt_tokenHash" ON "password_reset_tokens" ("tokenHash")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "students"`);
        await queryRunner.query(`DROP TYPE IF EXISTS account_status_enum`);
        await queryRunner.query(`DROP TABLE IF EXISTS "specialties"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "domain_roles"`);
    }
}
exports.StudentsDomainRolesSpecialties1783980000000 = StudentsDomainRolesSpecialties1783980000000;
//# sourceMappingURL=1783980000000-students-domain-roles-specialties.js.map