import { MigrationInterface, QueryRunner } from 'typeorm';

export class OauthClientResponsibleUser1783992000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_clients"
      ADD COLUMN "responsible_user_id" uuid NULL,
      ADD CONSTRAINT "FK_oauth_clients_responsible_user"
        FOREIGN KEY ("responsible_user_id") REFERENCES "students"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oauth_clients"
      DROP CONSTRAINT "FK_oauth_clients_responsible_user",
      DROP COLUMN "responsible_user_id"
    `);
  }
}