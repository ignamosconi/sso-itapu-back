import type { EntityManager } from 'typeorm';

export interface IPasswordResetTokenService {
  generate(studentId: string, purpose: 'setup' | 'reset'): Promise<string>;
  validate(token: string): Promise<{ studentId: string; purpose: 'setup' | 'reset' }>;
  consume(token: string): Promise<{ studentId: string; purpose: 'setup' | 'reset' }>;
  // Borra todos los links pendientes (no usados) del alumno, de cualquier propósito.
  // Se usa al cambiar su email: los links ya enviados al email viejo dejan de servir.
  invalidateAllForStudent(studentId: string, manager?: EntityManager): Promise<void>;
}