import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('domain_roles')
export class DomainRoleEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 64 })
  name!: string;

  /** Regla fija desde la creación: el cargo no se puede combinar con otros cargos. */
  @Column({ type: 'boolean', default: false })
  exclusive!: boolean;

  /** Regla fija desde la creación: quien tenga este cargo debe tener exactamente una especialidad. */
  @Column({ name: 'single_specialty', type: 'boolean', default: false })
  singleSpecialty!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}