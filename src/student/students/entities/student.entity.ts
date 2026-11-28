import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToMany, JoinTable,
} from 'typeorm';
import { DomainRoleEntity } from '../../../domain-role/entities/domain-role.entity.js';
import { SpecialtyEntity } from '../../../specialty/entities/specialty.entity.js';

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

  /**
   * Cargos institucionales del usuario (al menos uno). Las reglas de combinación ("exclusive",
   * "single_specialty") de cada cargo se validan en el servicio con checkAssignmentRules().
   */
  @ManyToMany(() => DomainRoleEntity, { eager: true })
  @JoinTable({
    name: 'student_domain_roles',
    joinColumn: { name: 'student_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'domain_role_id', referencedColumnName: 'id' },
  })
  domainRoles!: DomainRoleEntity[];

  /** Especialidades del usuario (al menos una). */
  @ManyToMany(() => SpecialtyEntity, { eager: true })
  @JoinTable({
    name: 'student_specialties',
    joinColumn: { name: 'student_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'specialty_id', referencedColumnName: 'id' },
  })
  specialties!: SpecialtyEntity[];

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.PendingRegistration })
  account_status!: AccountStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}