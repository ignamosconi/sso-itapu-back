import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateStudentDto } from './create-student.dto.js';
import { UpdateStudentDto } from './update-student.dto.js';
import { ImportConfirmDto } from './import-confirm.dto.js';
import { CreateDomainRoleDto } from '../../../domain-role/dtos/create-domain-role.dto.js';

// Misma configuración que main.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
const run = (metatype: ArgumentMetadata['metatype'], value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });
const messages = async (metatype: ArgumentMetadata['metatype'], value: unknown): Promise<string[]> => {
  try {
    await run(metatype, value);
    return [];
  } catch (e) {
    return ((e as BadRequestException).getResponse() as { message: string[] }).message;
  }
};

const baseStudent = {
  first_name: 'Ana', last_name: 'Pérez', email: 'ana@ejemplo.com', dni: 33456789, birth_date: '1998-11-22',
};

describe('DTOs de cargos y especialidades múltiples', () => {
  describe('CreateStudentDto', () => {
    it('acepta listas de ids', async () => {
      const dto = await run(CreateStudentDto, { ...baseStudent, domain_role_ids: [2, 3], specialty_ids: ['1'] });
      expect(dto).toMatchObject({ domain_role_ids: [2, 3], specialty_ids: [1] });
    });

    it('rechaza listas vacías, repetidos, ids inválidos y listas demasiado largas', async () => {
      expect(await messages(CreateStudentDto, { ...baseStudent, domain_role_ids: [], specialty_ids: [] }))
        .toEqual(expect.arrayContaining(['Indicá al menos un cargo.', 'Indicá al menos una especialidad.']));
      expect(await messages(CreateStudentDto, { ...baseStudent, domain_role_ids: [2, 2], specialty_ids: [1] }))
        .toContain('Hay cargos repetidos.');
      expect((await messages(CreateStudentDto, { ...baseStudent, domain_role_ids: [0, 2147483648], specialty_ids: [1] })).length).toBeGreaterThan(0);
      expect((await messages(CreateStudentDto, { ...baseStudent, domain_role_ids: Array.from({ length: 11 }, (_, i) => i + 1), specialty_ids: [1] })).length).toBeGreaterThan(0);
      expect((await messages(CreateStudentDto, { ...baseStudent, domain_role_ids: 2, specialty_ids: [1] })).length).toBeGreaterThan(0);
    });

    it('rechaza los campos viejos de un solo cargo (formato anterior)', async () => {
      expect(await messages(CreateStudentDto, { ...baseStudent, domain_role_id: 1, specialty_id: 1 }))
        .toEqual(expect.arrayContaining(['property domain_role_id should not exist']));
    });
  });

  describe('UpdateStudentDto', () => {
    it('exige la contraseña del admin', async () => {
      expect(await messages(UpdateStudentDto, { first_name: 'Nacho' }))
        .toContain('Ingresá tu contraseña de administrador para confirmar los cambios.');
    });

    it('acepta listas opcionales y la contraseña', async () => {
      await expect(run(UpdateStudentDto, { domain_role_ids: [1], admin_password: 'x' })).resolves.toBeDefined();
    });

    it('no permite cambiar email, contraseña ni username por esta vía', async () => {
      const msgs = await messages(UpdateStudentDto, { email: 'a@b.c', password: 'x', username: 'y', admin_password: 'x' });
      expect(msgs).toEqual(expect.arrayContaining([
        'property email should not exist', 'property password should not exist', 'property username should not exist',
      ]));
    });

    it('limita el largo de la contraseña del admin', async () => {
      expect((await messages(UpdateStudentDto, { first_name: 'Nacho', admin_password: 'x'.repeat(129) })).length).toBeGreaterThan(0);
    });
  });

  describe('ImportConfirmDto', () => {
    it('cada fila necesita listas de ids válidas', async () => {
      const row = { ...baseStudent, domainRoleIds: [1], specialtyIds: [1] };
      await expect(run(ImportConfirmDto, { rows: [row] })).resolves.toBeDefined();
      expect((await messages(ImportConfirmDto, { rows: [{ ...row, domainRoleIds: [] }] })).length).toBeGreaterThan(0);
      expect((await messages(ImportConfirmDto, { rows: [{ ...row, domainRoleId: 1 }] })).length).toBeGreaterThan(0);
    });
  });

  describe('CreateDomainRoleDto', () => {
    it('acepta las reglas como booleanos opcionales', async () => {
      await expect(run(CreateDomainRoleDto, { name: 'Alumno', exclusive: true, single_specialty: true })).resolves.toBeDefined();
      await expect(run(CreateDomainRoleDto, { name: 'Profesor' })).resolves.toBeDefined();
    });

    it('rechaza reglas que no sean booleanos y campos desconocidos', async () => {
      expect((await messages(CreateDomainRoleDto, { name: 'Alumno', exclusive: 'true' })).length).toBeGreaterThan(0);
      expect(await messages(CreateDomainRoleDto, { name: 'Alumno', singleSpecialty: true }))
        .toContain('property singleSpecialty should not exist');
    });
  });
});
