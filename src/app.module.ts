import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalaryModule } from './salary/salary.module';
import { Salary } from './salary/salary.entity';
import * as dotenv from 'dotenv';
import { ScoreModule } from './score/score.module';

dotenv.config();

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mariadb',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 3306,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: [Salary],
      autoLoadEntities: true,
      synchronize: true,
      retryAttempts: 10, // Attendre si la DB n'est pas prête
      retryDelay: 5000,
    }),
    SalaryModule,
    ScoreModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
