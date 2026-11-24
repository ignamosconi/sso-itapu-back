import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  tokenHash!: string;

  @Index()
  @Column('uuid')
  familyId!: string;

  @Index()
  @Column()
  sub!: string;

  // 'student' | 'admin'
  @Column()
  type!: string;

  @Column({ default: false })
  used!: boolean;

  // Momento en que se canjeó (rotó) el token. Sirve para tolerar refresh concurrentes (P9).
  @Column({ nullable: true, type: 'timestamp' })
  usedAt!: Date | null;

  @Column({ default: false })
  revoked!: boolean;

  @Column()
  expiresAt!: Date;

  // Límite absoluto de la sesión. Se fija al crear el primer refresh token
  // de la familia (al canjear el authorization code) y se hereda en cada
  // rotación sin modificarse. NULL para tokens de admin (sin límite absoluto).
  @Column({ nullable: true, type: 'timestamp' })
  sessionExpiresAt!: Date | null;

  // App OAuth a través de la cual se autenticó el alumno.
  // NULL para tokens de tipo 'admin' (no pasan por una app OAuth).
  // Siempre presente para tokens de tipo 'student'.
  @Index()
  @Column({ nullable: true, type: 'int' })
  clientId!: number | null;

  @CreateDateColumn()
  createdAt!: Date;
}