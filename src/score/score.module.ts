import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Score } from './entities/score.entity';
import { ScoreService } from './services/score.service';
import { ScoreController } from './score.controller';
import { MlModelService } from './services/ml-model.service';
import { SimilarityService } from './services/similarity.service';
import { StatisticsService } from './services/statistics.service';
import { SalaryModule } from '../salary/salary.module'; // Ajuste selon ta structure
import { ScoreCalcul } from './score-calcul';
import { ScoreResult } from './entities/score-result.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Score, ScoreResult]),
    SalaryModule,
    AuthModule,
  ],
  providers: [
    ScoreService,
    ScoreCalcul,
    MlModelService,
    SimilarityService,
    StatisticsService,
  ],
  controllers: [ScoreController],
  exports: [ScoreService],
})
export class ScoreModule {}
