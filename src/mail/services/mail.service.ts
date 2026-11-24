import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { IMailService } from './mail.service.interface.js';

@Injectable()
export class MailService implements IMailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const port = Number(configService.getOrThrow<number>('MAIL_PORT'));
    // X6: sin requireTLS, nodemailer seguía enviando usuario/clave y los links por texto plano si el servidor
    // no ofrecía STARTTLS. En producción se exige TLS; MAIL_REQUIRE_TLS=false permite un SMTP local de desarrollo.
    const requireTlsEnv = configService.get<string>('MAIL_REQUIRE_TLS');
    const requireTLS = requireTlsEnv ? requireTlsEnv === 'true' : configService.get<string>('NODE_ENV') === 'production';
    this.transporter = nodemailer.createTransport({
      host: configService.getOrThrow<string>('MAIL_HOST'),
      port,
      secure: port === 465, // 465 = TLS implícito; 587/25 = STARTTLS
      requireTLS,
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
      headers: { 'Content-Language': 'es' },
      ...(content.html ? { html: content.html } : {}),
      ...(content.text ? { text: content.text } : {}),
    });
  }
}