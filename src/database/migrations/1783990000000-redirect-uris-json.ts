import { MigrationInterface, QueryRunner } from 'typeorm';

export class RedirectUrisJson1783990000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // simple-array: "https://a.com,https://b.com"
    // simple-json:  ["https://a.com","https://b.com"]
    // La condición WHERE evita doble conversión si la migración corre dos veces.
    await queryRunner.query(`
      UPDATE oauth_clients
      SET "redirectUris" = to_json(string_to_array("redirectUris", ','))::text
      WHERE "redirectUris" NOT LIKE '[%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE oauth_clients
      SET "redirectUris" = array_to_string(
        ARRAY(SELECT jsonb_array_elements_text("redirectUris"::jsonb)),
        ','
      )
      WHERE "redirectUris" LIKE '[%'
    `);
  }
}