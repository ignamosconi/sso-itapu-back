import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Múltiples cargos y especialidades por usuario (v2.0.0).
 *
 *  - domain_roles gana dos reglas que el admin fija al crear el cargo y que después no se pueden cambiar:
 *      "exclusive"        → el cargo no se combina con otros cargos.
 *      "single_specialty" → quien tenga el cargo debe tener exactamente una especialidad.
 *  - students.domain_role_id y students.specialty_id pasan a tablas intermedias (muchos a muchos).
 *    Los datos existentes se copian: cada usuario conserva su cargo y su especialidad actuales.
 *
 * Borrar un usuario borra sus filas en las tablas intermedias (CASCADE).
 * Borrar un cargo o especialidad asignado está prohibido por la FK (RESTRICT), además del chequeo del servicio.
 */
export class MultipleRolesSpecialties1783998000000 implements MigrationInterface {
  name = 'MultipleRolesSpecialties1783998000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "domain_roles"
        ADD COLUMN "exclusive" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN "single_specialty" BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE "student_domain_roles" (
        "student_id" UUID NOT NULL,
        "domain_role_id" INTEGER NOT NULL,
        CONSTRAINT "PK_student_domain_roles" PRIMARY KEY ("student_id", "domain_role_id"),
        CONSTRAINT "FK_sdr_student" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sdr_domain_role" FOREIGN KEY ("domain_role_id") REFERENCES "domain_roles"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sdr_domain_role_id" ON "student_domain_roles" ("domain_role_id")`);

    await queryRunner.query(`
      CREATE TABLE "student_specialties" (
        "student_id" UUID NOT NULL,
        "specialty_id" INTEGER NOT NULL,
        CONSTRAINT "PK_student_specialties" PRIMARY KEY ("student_id", "specialty_id"),
        CONSTRAINT "FK_ss_student" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ss_specialty" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ss_specialty_id" ON "student_specialties" ("specialty_id")`);

    // Copiar las asignaciones actuales (una por usuario) antes de borrar las columnas.
    await queryRunner.query(`INSERT INTO "student_domain_roles" ("student_id", "domain_role_id") SELECT "id", "domain_role_id" FROM "students"`);
    await queryRunner.query(`INSERT INTO "student_specialties" ("student_id", "specialty_id") SELECT "id", "specialty_id" FROM "students"`);

    await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "FK_student_domain_role"`);
    await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "FK_student_specialty"`);
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN "domain_role_id"`);
    await queryRunner.query(`ALTER TABLE "students" DROP COLUMN "specialty_id"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Vuelta atrás con pérdida: cada usuario conserva UN solo cargo y UNA sola especialidad (los de menor id).
    await queryRunner.query(`ALTER TABLE "students" ADD COLUMN "domain_role_id" INTEGER NULL`);
    await queryRunner.query(`ALTER TABLE "students" ADD COLUMN "specialty_id" INTEGER NULL`);
    await queryRunner.query(`
      UPDATE "students" s SET "domain_role_id" = x.rid
      FROM (SELECT "student_id", MIN("domain_role_id") AS rid FROM "student_domain_roles" GROUP BY "student_id") x
      WHERE x."student_id" = s."id"
    `);
    await queryRunner.query(`
      UPDATE "students" s SET "specialty_id" = x.sid
      FROM (SELECT "student_id", MIN("specialty_id") AS sid FROM "student_specialties" GROUP BY "student_id") x
      WHERE x."student_id" = s."id"
    `);
    await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "domain_role_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "students" ALTER COLUMN "specialty_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "students"
        ADD CONSTRAINT "FK_student_domain_role" FOREIGN KEY ("domain_role_id") REFERENCES "domain_roles"("id"),
        ADD CONSTRAINT "FK_student_specialty" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id")
    `);
    await queryRunner.query(`DROP TABLE "student_specialties"`);
    await queryRunner.query(`DROP TABLE "student_domain_roles"`);
    await queryRunner.query(`ALTER TABLE "domain_roles" DROP COLUMN "single_specialty", DROP COLUMN "exclusive"`);
  }
}
