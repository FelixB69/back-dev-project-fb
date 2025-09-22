import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  findById(id: number) {
    return this.repo.findOne({ where: { id } });
  }

  async create(email: string, password: string) {
    const existing = await this.findByEmail(email);
    if (existing) throw new ConflictException('Email already in use');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = this.repo.create({ email, passwordHash });
    return this.repo.save(user);
  }

  async validate(email: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user) return null;
    const ok = await argon2.verify(user.passwordHash, password);
    return ok ? user : null;
  }
}
