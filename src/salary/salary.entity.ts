import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Salary {
  @PrimaryGeneratedColumn('uuid')
  id: number;

  @Column()
  company: string;

  @Column()
  position: string;

  @Column()
  location: string;

  @Column('decimal') // Utilisé pour stocker la compensation
  salary: number;

  @Column('timestamp') // Utilisé pour la date
  date: Date;

  @Column()
  level: string;

  @Column('int')
  company_xp: number;

  @Column('int')
  total_xp: number;

  @Column('json')
  remote: {
    variant: string;
    dayCount: number;
    base: string;
    location: string;
  };
}
