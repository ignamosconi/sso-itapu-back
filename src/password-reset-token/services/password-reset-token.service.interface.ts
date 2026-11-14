export interface IPasswordResetTokenService {
  generate(studentId: string, purpose: 'setup' | 'reset'): Promise<string>;
  validate(token: string): Promise<{ studentId: string; purpose: 'setup' | 'reset' }>;
  consume(token: string): Promise<{ studentId: string; purpose: 'setup' | 'reset' }>;
}