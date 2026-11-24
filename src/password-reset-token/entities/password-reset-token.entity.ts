import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('password_reset_tokens')
export class PasswordResetTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ unique: true })
  tokenHash!: string;

  @Column()
  studentId!: string;

  // 'setup' = primer registro | 'reset' = recuperación
  @Column({ type: 'varchar' })
  purpose!: 'setup' | 'reset';

  @Column({ default: false })
  used!: boolean;

  @Column()
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}