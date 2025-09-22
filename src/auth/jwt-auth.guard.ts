import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const auth = String(req.headers['authorization'] || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(token); // vérif avec clé publique
      (req as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
