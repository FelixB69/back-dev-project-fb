import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Score } from './score.entity';
import { ScoreService } from './score.service';
import { ScoreController } from './score.controller';
import { SalaryModule } from '../salary/salary.module'; // Ajuste selon ta structure
import { ScoreCalcul } from './score-calcul';
import { ScoreResult } from './score-result.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Score, ScoreResult]), SalaryModule],
  providers: [ScoreService, ScoreCalcul],
  controllers: [ScoreController],
  exports: [ScoreService],
})
export class ScoreModule {}
