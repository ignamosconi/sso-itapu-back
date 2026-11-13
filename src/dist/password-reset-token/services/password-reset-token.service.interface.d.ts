export interface IPasswordResetTokenService {
    generate(studentId: string, purpose: 'setup' | 'reset'): Promise<string>;
    consume(token: string): Promise<{
        studentId: string;
        purpose: 'setup' | 'reset';
    }>;
}
