export interface IMailService {
  send(to: string, subject: string, content: { html?: string; text?: string }): Promise<void>;
}