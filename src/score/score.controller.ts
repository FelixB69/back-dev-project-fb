import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ScoreService } from './services/score.service';
import { Score } from './entities/score.entity';
import { CreateScoreDto } from './create-score.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

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

  @UseGuards(JwtAuthGuard)
  @Get('all')
  async getAllScores(): Promise<Score[]> {
    return this.scoreService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getStatistics(): Promise<any> {
    return this.scoreService.scoreStatistics();
  }

  @Post('analyze')
  async analyze(@Body() dto: CreateScoreDto) {
    return this.scoreService.analyzeAndSave(dto);
  }

  @Get('analyze/:id')
  async getById(@Param('id') id: string) {
    return this.scoreService.getAnalysisById(id);
  }

  @Get('email')
  async getByEmail(@Query('email') email: string) {
    return this.scoreService.findByEmail(email);
  }
}
