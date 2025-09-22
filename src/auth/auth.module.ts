import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { UsersModule } from '../user/user.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        privateKey: cfg.get<string>('JWT_PRIVATE'),
        publicKey: cfg.get<string>('JWT_PUBLIC'),
        signOptions: { algorithm: 'RS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
