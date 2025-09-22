import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // hash du token opaque (jamais stocker le brut)
  @Column({ name: 'hashed_token', length: 255 })
  hashedToken: string;

  // pour purges/filtrage
  @Index()
  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Index()
  @Column({ default: false })
  revoked: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
