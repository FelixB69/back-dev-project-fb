import { Injectable, NotFoundException } from '@nestjs/common';
import { SalaryService } from '../../salary/salary.service';
import { Salary } from '../../salary/entities/salary.entity';
import { Score } from '../entities/score.entity';
import { ScoreCalcul } from '../score-calcul';
import { CreateScoreDto } from '../create-score.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScoreResult } from '../entities/score-result.entity';
import { MlModelService } from './ml-model.service';
import { SimilarityService } from './similarity.service';
import { StatisticsService } from './statistics.service';

@Injectable()
export class ScoreService {
  constructor(
    private readonly salaryService: SalaryService,
    private readonly scoreCalcul: ScoreCalcul,
    private readonly mlModel: MlModelService,
    private readonly similarityService: SimilarityService,
    private readonly statisticsService: StatisticsService,
    @InjectRepository(Score)
    private readonly scoreRepository: Repository<Score>,
    @InjectRepository(ScoreResult)
    private readonly scoreResultRepository: Repository<ScoreResult>, // <—
  ) {}

  // expose some helpers delegating to mlModel/similarity
  // (comments from original file kept verbatim in other methods)

  // Coherence (relative salary error, unchanged)
  public async calculateCoherenceScore(target: Score): Promise<number> {
    const predicted = await this.mlModel.predictCompensation(target as any);
    const actual = target.compensation;
    const raw = actual === 0 ? 0 : 1 - Math.abs((actual - predicted) / actual);
    return Math.max(0, Math.min(1, raw));
  }

  // ---------- STATISTICS ----------
  public async calculateStatistics(target: Score): Promise<any> {
    const salaries =
      this.mlModel.trainCache?.salaries ?? (await this.salaryService.findAll());
    return this.statisticsService.calculateStatistics(
      target as any,
      salaries,
      this.createScore.bind(this),
    );
  }

  private async createScore(createScoreDto: CreateScoreDto) {
    const newScore = this.scoreRepository.create({
      ...createScoreDto,
      createdAt: new Date(),
    });
    return await this.scoreRepository.save(newScore);
  }

  // ANALYZE & SAVE
  public async analyzeAndSave(dto: CreateScoreDto) {
    const target: Score = {
      location: dto.location,
      total_xp: dto.total_xp ?? 0,
      compensation: dto.compensation,
      email: dto.email,
      consent: dto.consent,
    } as any;

    const output = await this.calculateStatistics(target);

    const row = this.scoreResultRepository.create({
      input: {
        location: dto.location ?? null,
        total_xp: dto.total_xp ?? null,
        compensation: dto.compensation,
        email: dto.email ?? null,
      },
      output,
    });
    const saved = await this.scoreResultRepository.save(row);

    return { id: saved.id, ...output };
  }

  public async getAnalysisById(id: string) {
    const found = await this.scoreResultRepository.findOne({ where: { id } });
    if (!found) throw new NotFoundException('ScoreResult introuvable');
    // vous pouvez décider de renvoyer { input, output } ou seulement output
    return {
      id: found.id,
      input: found.input,
      output: found.output,
      createdAt: found.createdAt,
    };
  }

  // FIND
  public async findAll(): Promise<Score[]> {
    return await this.scoreRepository.find();
  }

  public async findByEmail(email: string) {
    const data = await this.scoreResultRepository.query(
      `SELECT * FROM score_results WHERE JSON_EXTRACT(input, '$.email') = ?`,
      [email],
    );
    const result = data.map((row) => {
      return {
        id: row.id,
        input: JSON.parse(row.input),
      };
    });
    return result;
  }

  public async scoreStatistics(): Promise<any> {
    const scores = await this.findAll();
    return this.statisticsService.globalScoreStatistics(scores);
  }
}
