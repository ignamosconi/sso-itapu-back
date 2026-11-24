import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('specialties')
export class SpecialtyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 64 })
  name!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}