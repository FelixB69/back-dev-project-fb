import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { UsersService } from '../user/user.service';
import { RefreshToken } from './refresh-token.entity';
import { User } from '../user/user.entity';

@Injectable()
export class AuthService {
  private accessTtlSec: number;
  private refreshTtlDays: number;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {
    this.accessTtlSec = Number(this.cfg.get('JWT_ACCESS_TTL') ?? 600);
    this.refreshTtlDays = Number(this.cfg.get('REFRESH_TTL_DAYS') ?? 14);
  }

  /* ---------- Public API ---------- */

  async signup(email: string, password: string) {
    const user = await this.users.create(email, password);
    return this.issuePair(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.validate(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.issuePair(user);
  }

  async rotateRefresh(presentedRaw: string) {
    if (!presentedRaw) throw new UnauthorizedException('No refresh token');
    const match = await this.findMatchingRefresh(presentedRaw);
    if (!match) throw new UnauthorizedException('Invalid refresh');

    // rotation: révoque l’ancien puis réémet une paire
    match.revoked = true;
    await this.refreshRepo.save(match);
    return this.issuePair(match.user);
  }

  async revokeAllForUser(userId: number) {
    await this.refreshRepo.update(
      { user: { id: userId }, revoked: false },
      { revoked: true },
    );
  }

  /* ---------- Internes ---------- */

  private async signAccess(user: User) {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { algorithm: 'RS256', expiresIn: this.accessTtlSec },
    );
  }

  private async issuePair(user: User) {
    const accessToken = await this.signAccess(user);

    // refresh brut: valeur opaque suffisamment longue
    const raw = `${randomUUID()}.${randomUUID()}.${randomUUID()}`;
    const hashed = await argon2.hash(raw, { type: argon2.argon2id });
    const expires = new Date(
      Date.now() + this.refreshTtlDays * 24 * 3600 * 1000,
    );

    const entity = this.refreshRepo.create({
      user,
      hashedToken: hashed,
      expiresAt: expires,
      revoked: false,
    });
    await this.refreshRepo.save(entity);

    return {
      accessToken,
      accessExpiresIn: this.accessTtlSec,
      refreshToken: raw,
    };
  }

  /**
   * Sans jti, on retrouve le refresh en vérifiant le hash sur un petit lot
   * de tokens non expirés et non révoqués, du plus récent au plus ancien.
   * En pratique, le volume reste faible pour un utilisateur.
   */
  private async findMatchingRefresh(presentedRaw: string) {
    const now = new Date();
    // On ne ramène qu’un lot raisonnable, les plus récents d’abord
    const candidates = await this.refreshRepo.find({
      where: { revoked: false, expiresAt: Not(null) },
      order: { id: 'DESC' },
      take: 500,
      relations: ['user'],
    });

    for (const rec of candidates) {
      if (rec.expiresAt <= now) continue;
      const ok = await argon2
        .verify(rec.hashedToken, presentedRaw)
        .catch(() => false);
      if (ok) return rec;
    }
    return null;
  }
}
