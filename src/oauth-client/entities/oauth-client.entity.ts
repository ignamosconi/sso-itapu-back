import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { StudentEntity } from '../../student/students/entities/student.entity.js';

@Entity('oauth_clients')
export class OAuthClientEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  clientName!: string;

  @Column({ type: 'simple-json' })
  redirectUris!: string[];

  @Column({ unique: true })
  clientSecret!: string;

  @Column({ default: true })
  isActive!: boolean;

  @ManyToOne(() => StudentEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'responsible_user_id' })
  responsibleUser!: StudentEntity | null;

  @Column({ name: 'responsible_user_id', nullable: true, type: 'varchar' })
  responsibleUserId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}