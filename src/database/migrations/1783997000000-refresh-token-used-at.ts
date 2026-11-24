import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokenUsedAt1783997000000 implements MigrationInterface {
  name = 'RefreshTokenUsedAt1783997000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "usedAt"`);
  }
}
