import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

// Solicitud de cambio de email pendiente de confirmación.
// El token en texto plano solo viaja por mail al email NUEVO; acá se guarda su hash.
@Entity('email_change_requests')
export class EmailChangeRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId!: string;

  // Email al que se va a cambiar, ya normalizado (minúsculas, sin espacios).
  @Column()
  newEmail!: string;

  @Column({ unique: true })
  tokenHash!: string;

  @Column({ default: false })
  used!: boolean;

  @Column()
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}