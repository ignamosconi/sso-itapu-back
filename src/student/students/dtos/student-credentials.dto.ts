//DTO interno para autenticación, no se muestra en Swagger.
export class StudentCredentialsDto {
  id!: string;
  username!: string;
  email!: string;
  first_name!: string;
  last_name!: string;
  password!: string | null;
  account_status!: string;
  /** Nombres de los cargos, ordenados alfabéticamente. */
  domainRoleNames!: string[];
  /** Nombres de las especialidades, ordenados alfabéticamente. */
  specialtyNames!: string[];
}