import { MigrationInterface, QueryRunner } from "typeorm";

export class EmailChangeRequests1783994000000 implements MigrationInterface {
  name = 'EmailChangeRequests1783994000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "email_change_requests" (
        "id"        uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "studentId" uuid              NOT NULL,
        "newEmail"  character varying NOT NULL,
        "tokenHash" character varying NOT NULL,
        "used"      boolean           NOT NULL DEFAULT false,
        "expiresAt" TIMESTAMP         NOT NULL,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_email_change_requests_tokenHash" UNIQUE ("tokenHash"),
        CONSTRAINT "PK_email_change_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_change_requests_student" FOREIGN KEY ("studentId")
          REFERENCES "students" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_change_requests_studentId" ON "email_change_requests" ("studentId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_email_change_requests_studentId"`);
    await queryRunner.query(`DROP TABLE "email_change_requests"`);
  }
}