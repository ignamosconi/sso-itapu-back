import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AdminEntity } from '../../admin/entities/admin.entity.js';
export declare class AdminSeeder {
    private readonly adminRepository;
    private readonly configService;
    constructor(adminRepository: Repository<AdminEntity>, configService: ConfigService);
    seed(): Promise<void>;
}
