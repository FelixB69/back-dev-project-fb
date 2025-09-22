import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const cookieOpts = {
  httpOnly: true,
  secure: true, // true en prod (https)
  sameSite: 'lax' as const,
  path: '/auth',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, accessExpiresIn, refreshToken } =
      await this.auth.signup(dto.email, dto.password);
    res.cookie('refresh_token', refreshToken, cookieOpts);
    return { accessToken, expiresIn: accessExpiresIn };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, accessExpiresIn, refreshToken } =
      await this.auth.login(dto.email, dto.password);
    res.cookie('refresh_token', refreshToken, cookieOpts);
    return { accessToken, expiresIn: accessExpiresIn };
  }

  @Post('refresh')
  async refresh(@Res({ passthrough: true }) res: Response) {
    // cookie-parser monté dans main.ts

    const rt: string | undefined = res.req.cookies?.['refresh_token'];
    const { accessToken, accessExpiresIn, refreshToken } =
      await this.auth.rotateRefresh(rt || '');
    res.cookie('refresh_token', refreshToken, cookieOpts);
    return { accessToken, expiresIn: accessExpiresIn };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token', { ...cookieOpts, maxAge: 0 });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Res({ passthrough: true }) res: Response) {
    const user = (res.req as any).user;
    return { user };
  }
}
