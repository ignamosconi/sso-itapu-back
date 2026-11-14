import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokenClientidIndex1783991000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_clientId"
      ON "refresh_tokens" ("clientId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_refresh_tokens_clientId"
    `);
  }
}