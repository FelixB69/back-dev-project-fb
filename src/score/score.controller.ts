import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ScoreService } from './score.service';
import { Score } from './score.entity';
import { CreateScoreDto } from './create-score.dto';

@Controller('scores')
export class ScoreController {
  constructor(private readonly scoreService: ScoreService) {}

  @Post('coherence')
  async calculateCoherence(
    @Body() target: Score,
  ): Promise<{ coherenceScore: number }> {
    const coherenceScore =
      await this.scoreService.calculateCoherenceScore(target);
    return { coherenceScore };
  }

  @Post('statistics')
  async calculateStatistics(@Body() target: Score): Promise<any> {
    return this.scoreService.calculateStatistics(target);
  }

  @Get('all')
  async getAllScores(): Promise<Score[]> {
    return this.scoreService.findAll();
  }

  @Post('analyze')
  async analyze(@Body() dto: CreateScoreDto) {
    return this.scoreService.analyzeAndSave(dto);
  }

  /** Relit un résultat par id (stable dans le temps) */
  @Get('analyze/:id')
  async getById(@Param('id') id: string) {
    return this.scoreService.getAnalysisById(id);
  }
}
