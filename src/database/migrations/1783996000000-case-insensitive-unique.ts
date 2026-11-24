import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unicidad sin distinguir mayúsculas para students.email, domain_roles.name y specialties.name (N10 / N16).
 * Antes "Ana@x.com" y "ana@x.com" (o "Alumno" y "alumno") coexistían porque el UNIQUE original es sensible a mayúsculas.
 * Los índices UNIQUE originales se mantienen; estos se suman.
 */
const TARGETS = [
  { table: 'students', column: 'email', index: 'UQ_students_email_lower' },
  { table: 'domain_roles', column: 'name', index: 'UQ_domain_roles_name_lower' },
  { table: 'specialties', column: 'name', index: 'UQ_specialties_name_lower' },
] as const;

export class CaseInsensitiveUnique1783996000000 implements MigrationInterface {
  name = 'CaseInsensitiveUnique1783996000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Si ya hay valores que solo difieren en mayúsculas, el índice fallaría con un error poco claro.
    for (const t of TARGETS) {
      const dups = (await queryRunner.query(`
        SELECT lower(btrim("${t.column}")) AS v, count(*)::int AS n
        FROM "${t.table}" GROUP BY 1 HAVING count(*) > 1
      `)) as { v: string; n: number }[];
      if (dups.length > 0) {
        const detail = dups.map(d => `"${d.v}" (${d.n} filas)`).join('; ');
        throw new Error(
          `Hay valores repetidos (ignorando mayúsculas) en ${t.table}.${t.column}: ${detail}. ` +
          `Corregilos o eliminá los duplicados y volvé a correr la migración.`,
        );
      }
    }
    for (const t of TARGETS) {
      await queryRunner.query(`CREATE UNIQUE INDEX "${t.index}" ON "${t.table}" (lower(btrim("${t.column}")))`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of TARGETS) await queryRunner.query(`DROP INDEX IF EXISTS "${t.index}"`);
  }
}
