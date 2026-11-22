import { MigrationInterface, QueryRunner } from 'typeorm';

export class OAuthClientNameUnique1783995000000 implements MigrationInterface {
  name = 'OAuthClientNameUnique1783995000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // unaccent() no es IMMUTABLE y Postgres no la acepta en un índice: se envuelve.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION immutable_unaccent(text)
      RETURNS text
      LANGUAGE sql
      IMMUTABLE PARALLEL SAFE STRICT
      AS $$ SELECT public.unaccent('public.unaccent', $1) $$
    `);

    // Si ya hay nombres repetidos, el índice fallaría con un error poco claro.
    const dups = (await queryRunner.query(`
      SELECT lower(immutable_unaccent(btrim("clientName"))) AS n, array_agg(id ORDER BY id) AS ids
      FROM "oauth_clients"
      GROUP BY 1
      HAVING count(*) > 1
    `)) as { n: string; ids: number[] }[];
    if (dups.length > 0) {
      const detail = dups.map(d => `"${d.n}" (ids: ${d.ids.join(', ')})`).join('; ');
      throw new Error(
        `Hay clientes OAuth con nombres repetidos: ${detail}. Renombralos desde el panel y volvé a correr la migración.`,
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_oauth_clients_client_name_normalized"
      ON "oauth_clients" (lower(immutable_unaccent(btrim("clientName"))))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_oauth_clients_client_name_normalized"`);
    await queryRunner.query(`DROP FUNCTION immutable_unaccent(text)`);
  }
}