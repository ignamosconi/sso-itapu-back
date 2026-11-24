import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminUsernameLength1783970000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admins"
        ALTER COLUMN "username" TYPE varchar(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admins"
        ALTER COLUMN "username" TYPE varchar(255)
    `);
  }
}