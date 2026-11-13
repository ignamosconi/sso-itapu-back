import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { IMailService } from './mail.service.interface.js';

@Injectable()
export class MailService implements IMailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: configService.getOrThrow<string>('MAIL_HOST'),
      port: configService.getOrThrow<number>('MAIL_PORT'),
      secure: false,
      auth: {
        user: configService.getOrThrow<string>('MAIL_USER'),
        pass: configService.getOrThrow<string>('MAIL_PASS'),
      },
    });
    this.from = configService.getOrThrow<string>('MAIL_FROM');
  }

  async send(to: string, subject: string, content: { html?: string; text?: string }): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      ...(content.html ? { html: content.html } : {}),
      ...(content.text ? { text: content.text } : {}),
    });
  }
}