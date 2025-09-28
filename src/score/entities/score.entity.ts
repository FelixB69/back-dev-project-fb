import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Score {
  @PrimaryGeneratedColumn()
  id: string;

  @Column({ type: 'float' })
  compensation: number;

  @Column({ type: 'float', nullable: true })
  company_xp: number;

  @Column({ type: 'float', nullable: true })
  total_xp: number;

  @Column({ type: 'varchar', length: 100 })
  location: string;

  @Column({ length: 100 })
  email: string;

  @Column({ type: 'boolean', default: false })
  consent: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
