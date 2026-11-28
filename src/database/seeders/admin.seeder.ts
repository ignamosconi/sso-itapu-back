import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminEntity } from '../../admin/entities/admin.entity.js';
import { passwordPolicyErrors, passwordPolicyMessage } from '../../common/validators/password-policy.validator.js';
import { BCRYPT_MAX_BYTES } from '../../common/validators/max-bytes.validator.js';

@Injectable()
export class AdminSeeder {
  constructor(
    @InjectRepository(AdminEntity)
    private readonly adminRepository: Repository<AdminEntity>,
    private readonly configService: ConfigService,
  ) {}

  async seed(): Promise<void> {
    const env = this.configService.get<string>('NODE_ENV') ?? 'development';

    if (env === 'production') {
      console.log('[Seeder] Entorno production detectado — seeder deshabilitado.');
      return;
    }

    const username = this.configService.getOrThrow<string>('ADMIN_USERNAME_SEEDER');
    const password = this.configService.getOrThrow<string>('ADMIN_PASSWORD_SEEDER');

    const exists = await this.adminRepository.findOne({ where: { username } });
    if (exists) return;

    // El primer admin también cumple la política de contraseñas (igual que los que se crean desde el panel).
    const missing = passwordPolicyErrors(password);
    if (missing.length > 0) {
      throw new Error(`[Seeder] ADMIN_PASSWORD_SEEDER no cumple la política. ${passwordPolicyMessage(missing)}`);
    }
    // bcrypt ignora en silencio lo que pase de 72 bytes: se rechaza, igual que en el panel.
    if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_BYTES) {
      throw new Error(`[Seeder] ADMIN_PASSWORD_SEEDER no puede superar los ${BCRYPT_MAX_BYTES} bytes.`);
    }

    const hashed = await bcrypt.hash(password, 12);
    await this.adminRepository.save({ username, password: hashed });

    console.log(`[Seeder] Admin "${username}" creado.`);
  }
}