import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { UsersModule } from '../user/user.module';
import * as fs from 'fs';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        privateKey: fs.readFileSync(
          cfg.get<string>('JWT_PRIVATE_PATH'),
          'utf8',
        ),
        publicKey: fs.readFileSync(cfg.get<string>('JWT_PUBLIC_PATH'), 'utf8'),
        signOptions: {
          algorithm: 'RS256',
          expiresIn: Number(cfg.get('JWT_ACCESS_TTL') ?? 600), // en secondes
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule],
})
export class AuthModule {}
