import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('score_results')
export class ScoreResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'json' })
  input: {
    location: string | null;
    total_xp: number | null;
    compensation: number;
    email?: string | null;
  };

  @Column({ type: 'json' })
  output: any;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
