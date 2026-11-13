import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { DomainRoleEntity } from '../../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../../specialty/entities/specialty.entity.js';

export enum AccountStatus {
  Active = 'active',
  Suspended = 'suspended',
  PendingRegistration = 'pending_registration',
}

@Entity('students')
export class StudentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Solo letras (con tildes) y espacios
  @Column({ length: 64 })
  first_name!: string;

  // Solo letras (con tildes) y espacios
  @Column({ length: 64 })
  last_name!: string;

  @Column({ unique: true, length: 64 })
  username!: string;

  @Column({ unique: true })
  email!: string;

  // null = nunca configuró contraseña (pending_registration)
  @Column({ nullable: true, type: 'varchar' })
  password!: string | null;

  @Column({ type: 'integer', unique: true })
  dni!: number;

  @Column({ type: 'date' })
  birth_date!: Date;

  @ManyToOne(() => DomainRoleEntity, { eager: true, nullable: false })
  @JoinColumn({ name: 'domain_role_id' })
  domainRole!: DomainRoleEntity;

  @Column({ name: 'domain_role_id' })
  domainRoleId!: number;

  @ManyToOne(() => SpecialtyEntity, { eager: true, nullable: false })
  @JoinColumn({ name: 'specialty_id' })
  specialty!: SpecialtyEntity;

  @Column({ name: 'specialty_id' })
  specialtyId!: number;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.PendingRegistration })
  account_status!: AccountStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}