import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { RemoteDetails } from './remote-details.entity';

@Entity()
export class Salary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  company: string;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  location: string;

  @Column({ type: 'int', nullable: true })
  compensation: number;

  @Column({ type: 'date', nullable: true })
  date: Date;

  @Column({ nullable: true })
  level: string;

  @Column({ type: 'int', nullable: true })
  company_xp: number;

  @Column({ type: 'int', nullable: true })
  total_xp: number;

  @Column('json', { nullable: true })
  remote: RemoteDetails;
}
