import { SalaryService } from '../salary/salary.service'; // Adjust the import path as needed
import { Salary } from '../salary/salary.entity'; // Adjust the import path as needed
import { Score } from './score.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ScoreService {
  constructor(private readonly salaryService: SalaryService) {}

  private normalizeValue(value: number, min: number, max: number): number {
    return (value - min) / (max - min);
  }

  private async calculateSimilarityScore(
    target: Score,
    comparison: Salary,
  ): Promise<number> {
    let score = 0;
    const weights = {
      compensation: 0.5,
      company_xp: 0.2,
      total_xp: 0.2,
      location: 0.1,
    };

    // Fetch all salaries and wait for the promise to resolve
    const salaries = await this.salaryService.findAll();

    // Normalize and compare compensation
    const minCompensation = Math.min(...salaries.map((d) => d.compensation));
    const maxCompensation = Math.max(...salaries.map((d) => d.compensation));
    const compensationScore =
      1 -
      Math.abs(
        this.normalizeValue(
          target.compensation,
          minCompensation,
          maxCompensation,
        ) -
          this.normalizeValue(
            comparison.compensation,
            minCompensation,
            maxCompensation,
          ),
      );
    score += compensationScore * weights.compensation;

    // Normalize and compare total experience
    if (target.total_xp !== null && comparison.total_xp !== null) {
      const minTotalXp = Math.min(
        ...(salaries
          .filter((d) => d.total_xp !== null)
          .map((d) => d.total_xp!) as number[]),
      );
      const maxTotalXp = Math.max(
        ...(salaries
          .filter((d) => d.total_xp !== null)
          .map((d) => d.total_xp!) as number[]),
      );
      const totalXpScore =
        1 -
        Math.abs(
          this.normalizeValue(target.total_xp, minTotalXp, maxTotalXp) -
            this.normalizeValue(comparison.total_xp, minTotalXp, maxTotalXp),
        );
      score += totalXpScore * weights.total_xp;
    }

    // Compare location
    const locationScore = target.location === comparison.location ? 1 : 0;
    score += locationScore * weights.location;

    return score;
  }

  public async calculateCoherenceScore(target: Score): Promise<number> {
    const salaries = await this.salaryService.findAll();
    const scores = await Promise.all(
      salaries.map((comparison) =>
        this.calculateSimilarityScore(target, comparison),
      ),
    );
    const averageScore =
      scores.reduce((sum, score) => sum + score, 0) / scores.length;
    return averageScore;
  }

  public async calculateStatistics(target: Score): Promise<any> {
    const salaries = await this.salaryService.findAll();
    const scores = await Promise.all(
      salaries.map((comparison) =>
        this.calculateSimilarityScore(target, comparison),
      ),
    );
    const coherenceScore = await this.calculateCoherenceScore(target);

    // Calculate statistics
    const percentiles = this.calculateCommonPercentiles(scores);
    const meanScore = this.calculateMean(scores);
    const stdScore = this.calculateStd(scores, meanScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const medianScore = this.calculateMedian(scores);
    const quartiles = this.calculateQuartiles(scores);
    const numHigher = scores.filter((s) => s > coherenceScore).length;
    const numLower = scores.filter((s) => s < coherenceScore).length;

    return {
      coherenceScore,
      percentiles,
      meanScore,
      stdScore,
      minScore,
      maxScore,
      medianScore,
      quartiles,
      numHigher,
      numLower,
    };
  }

  private calculatePercentiles(scores: number[]): number[] {
    const sorted = [...scores].sort((a, b) => a - b);
    return sorted.map(
      (_, index) => sorted[Math.floor((index / sorted.length) * 100)],
    );
  }

  private calculateMean(scores: number[]): number {
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  private calculateStd(scores: number[], mean: number): number {
    const variance =
      scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
      scores.length;
    return Math.sqrt(variance);
  }

  private calculateMedian(scores: number[]): number {
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculateQuartiles(scores: number[]): number[] {
    const sorted = [...scores].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q2 = this.percentile(sorted, 50);
    const q3 = this.percentile(sorted, 75);
    return [q1, q2, q3];
  }

  private calculateCommonPercentiles(scores: number[]): Record<string, number> {
    const sorted = [...scores].sort((a, b) => a - b);
    return {
      p10: this.percentile(sorted, 10),
      p25: this.percentile(sorted, 25),
      p50: this.percentile(sorted, 50),
      p75: this.percentile(sorted, 75),
      p90: this.percentile(sorted, 90),
    };
  }

  private percentile(sorted: number[], percentile: number): number {
    const index = (sorted.length - 1) * (percentile / 100);
    const lower = Math.floor(index);
    const upper = lower + 1;
    const weight = index - lower;

    if (upper >= sorted.length) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
}
