import { ConfigService } from '@nestjs/config';
import type { IMailService } from './mail.service.interface.js';
export declare class MailService implements IMailService {
    private readonly configService;
    private readonly transporter;
    private readonly from;
    constructor(configService: ConfigService);
    send(to: string, subject: string, content: {
        html?: string;
        text?: string;
    }): Promise<void>;
}
