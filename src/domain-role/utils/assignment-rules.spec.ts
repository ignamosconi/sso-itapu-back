import { checkAssignmentRules, sortByName, RuleRole } from './assignment-rules.js';

const role = (name: string, exclusive = false, singleSpecialty = false): RuleRole => ({ name, exclusive, singleSpecialty });

describe('checkAssignmentRules', () => {
  it('acepta un cargo libre con varias especialidades', () => {
    expect(checkAssignmentRules([role('Profesor')], 3)).toEqual([]);
  });

  it('acepta varios cargos libres', () => {
    expect(checkAssignmentRules([role('Profesor'), role('Preceptor')], 2)).toEqual([]);
  });

  it('acepta un cargo exclusivo solo', () => {
    expect(checkAssignmentRules([role('Alumno', true, true)], 1)).toEqual([]);
  });

  it('exige al menos un cargo y una especialidad', () => {
    expect(checkAssignmentRules([], 0)).toEqual([
      'Debe tener al menos un cargo.',
      'Debe tener al menos una especialidad.',
    ]);
  });

  it('rechaza un cargo exclusivo combinado con otro', () => {
    expect(checkAssignmentRules([role('Alumno', true), role('Autoridad')], 1)).toEqual([
      'El cargo "Alumno" no se puede combinar con otros cargos.',
    ]);
  });

  it('reporta cada cargo exclusivo cuando hay dos', () => {
    expect(checkAssignmentRules([role('A', true), role('B', true)], 1)).toHaveLength(2);
  });

  it('si ALGUNO de los cargos exige una sola especialidad, aplica a todo el usuario', () => {
    expect(checkAssignmentRules([role('Profesor'), role('Preceptor', false, true)], 2)).toEqual([
      'El cargo "Preceptor" exige exactamente una especialidad (se indicaron 2).',
    ]);
  });

  it('una sola especialidad con el cargo que la exige es válido', () => {
    expect(checkAssignmentRules([role('Profesor'), role('Preceptor', false, true)], 1)).toEqual([]);
  });

  it('acumula errores de ambas reglas', () => {
    expect(checkAssignmentRules([role('Alumno', true, true), role('Profesor')], 2)).toHaveLength(2);
  });
});

describe('sortByName', () => {
  it('ordena sin distinguir mayúsculas ni tildes y no muta el original', () => {
    const input = [{ name: 'Preceptor' }, { name: 'autoridad' }, { name: 'Ánimo' }];
    const out = sortByName(input);
    expect(out.map(x => x.name)).toEqual(['Ánimo', 'autoridad', 'Preceptor']);
    expect(input[0].name).toBe('Preceptor');
  });
});
