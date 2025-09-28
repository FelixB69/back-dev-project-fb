import { Injectable } from '@nestjs/common';
import { Salary } from '../../salary/entities/salary.entity';
import { ScoreCalcul } from '../score-calcul';
import { MlModelService } from './ml-model.service';
import { SimilarityService } from './similarity.service';
import { Score } from '../entities/score.entity';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly scoreCalcul: ScoreCalcul,
    private readonly mlModel: MlModelService,
    private readonly similarityService: SimilarityService,
  ) {}

  private computeAverageSalaryByExperience(
    data: Salary[],
  ): { xp: number; average: number }[] {
    const grouped = new Map<number, number[]>();

    for (const item of data) {
      const xp = Math.floor(item.total_xp ?? 0); // années révolues
      if (!grouped.has(xp)) grouped.set(xp, []);
      grouped.get(xp)!.push(item.compensation);
    }

    const result = [...grouped.entries()].map(([xp, comps]) => {
      const avg = comps.reduce((a, b) => a + b, 0) / comps.length;
      return { xp, average: Math.round(avg) };
    });

    return result.sort((a, b) => a.xp - b.xp);
  }

  private computeMedianSalaryByExperience(
    data: Salary[],
  ): { xp: number; median: number }[] {
    const grouped = new Map<number, number[]>();

    for (const item of data) {
      const xp = Math.floor(item.total_xp ?? 0); // années révolues
      if (!grouped.has(xp)) grouped.set(xp, []);
      grouped.get(xp)!.push(item.compensation);
    }

    const result = [...grouped.entries()].map(([xp, comps]) => {
      const sorted = comps.slice().sort((a, b) => a - b);
      const n = sorted.length;
      const median =
        n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

      return { xp, median: Math.round(median) };
    });

    return result.sort((a, b) => a.xp - b.xp);
  }

  private buildHistogram(
    values: number[],
    numBuckets: number,
  ): { range: string; count: number }[] {
    const buckets = Array(numBuckets).fill(0);
    for (const v of values) {
      const z = this.scoreCalcul.normalizeValue(v);
      const idx = Math.min(Math.floor(z * numBuckets), numBuckets - 1);
      buckets[idx]++;
    }
    return buckets.map((count, i) => ({
      range: `${(i / numBuckets).toFixed(1)}–${((i + 1) / numBuckets).toFixed(1)}`,
      count,
    }));
  }

  public async calculateStatistics(
    target: any,
    salaries: Salary[],
    createScoreFn: (dto: any) => Promise<any>,
  ) {
    await this.mlModel.modelReady;

    // save score
    await createScoreFn({
      location: target.location,
      total_xp: target.total_xp,
      compensation: target.compensation,
      email: target.email,
      consent: target.consent,
    });

    const scores = await Promise.all(
      salaries.map(async (s) => {
        const comp: any = {
          location: s.location,
          total_xp: s.total_xp,
          compensation: s.compensation,
        };
        return this.similarityService.calculateSimilarityScore(
          comp,
          target as any,
        );
      }),
    );

    const meanScore = this.scoreCalcul.calculateMean(scores);
    const stdScore = this.scoreCalcul.calculateStd(scores, meanScore);

    const coherenceScore = await (async () => {
      const predicted = await this.mlModel.predictCompensation(target as any);
      const actual = target.compensation;
      const raw =
        actual === 0 ? 0 : 1 - Math.abs((actual - predicted) / actual);
      return this.scoreCalcul.normalizeValue(raw);
    })();

    const predictedCompensation = await this.mlModel.predictCompensation(
      target as any,
    );
    const actualCompensation = target.compensation;

    const salaryValues = salaries
      .map((s) => s.compensation)
      .sort((a, b) => a - b);
    const percentileRank = this.scoreCalcul.getPercentileRank(
      salaryValues,
      actualCompensation,
    );

    const numHigher = scores.filter((s) => s > 0.5).length; // arbitrary threshold for “nearby”
    const numLower = scores.length - numHigher;
    const similarPercentage = Math.round(
      (numLower / Math.max(1, numHigher + numLower)) * 100,
    );

    const coherenceComment =
      coherenceScore > 0.9
        ? 'Ton salaire est parfaitement cohérent avec ton parcours'
        : coherenceScore > 0.7
          ? 'Ton salaire est globalement cohérent avec ton parcours'
          : coherenceScore > 0.4
            ? 'Ton salaire semble un peu décalé par rapport à ton profil'
            : 'Ton salaire est très atypique par rapport à ton profil';

    const averageByXp = this.computeAverageSalaryByExperience(salaries);
    const medianByXp = this.computeMedianSalaryByExperience(salaries);

    return {
      diagnostic: {
        title:
          coherenceScore > 0.9
            ? 'Parfaitement aligné 👌'
            : coherenceScore > 0.7
              ? 'Globalement cohérent ✅'
              : coherenceScore > 0.4
                ? 'Léger décalage 🤔'
                : 'Atypique 🔎',
        icon:
          coherenceScore > 0.9
            ? '👌'
            : coherenceScore > 0.7
              ? '✅'
              : coherenceScore > 0.4
                ? '🤔'
                : '🔎',
        description: coherenceComment,
      },

      // estimated gap
      estimatedGap: {
        predicted: Math.round(predictedCompensation),
        actual: Math.round(actualCompensation),
        difference: Math.round(actualCompensation - predictedCompensation),
        percentage: +(
          ((actualCompensation - predictedCompensation) /
            Math.max(1, predictedCompensation)) *
          100
        ).toFixed(1),
        comment:
          actualCompensation > predictedCompensation
            ? 'Tu gagnes plus que ce qui est estimé pour ton profil.'
            : actualCompensation < predictedCompensation
              ? 'Tu gagnes moins que ce qui est estimé pour ton profil.'
              : 'Tu gagnes exactement ce qui est attendu.',
      },

      // position relative
      salaryPosition: {
        percentile: percentileRank,
        rankLabel:
          percentileRank >= 90
            ? 'top 10%'
            : percentileRank >= 75
              ? 'top 25%'
              : percentileRank >= 50
                ? 'moyenne haute'
                : percentileRank >= 25
                  ? 'moyenne basse'
                  : 'bas de l’échelle',
        comparison: `Parmi les profils proches (localisation & XP), tu gagnes plus que ${similarPercentage}% d'entre eux.`,
      },

      // “main comparison” info
      similarityConfig: {
        wLocation: this.similarityService['wLocation'],
        wXp: this.similarityService['wXp'],
        sigmaXp: this.similarityService['sigmaXp'],
      },

      coherenceScore,
      meanScore,
      stdScore,

      chartData: {
        averageByXp,
        medianByXp,
        histogram: this.buildHistogram(scores, 10),
      },

      meta: {
        locations: this.mlModel.trainCache?.locations ?? [],
        inputMinMax: this.mlModel.inputMinMax,
        outputMinMax: this.mlModel.outputMinMax,
      },
    };
  }

  public async globalScoreStatistics(scores: Score[]) {
    const numberOfScores = scores.length;
    const averageCompensation =
      scores.reduce((sum, s) => sum + s.compensation, 0) / numberOfScores;
    const compensationValues = scores.map((s) => s.compensation);
    const medianCompensation =
      this.scoreCalcul.calculateMedian(compensationValues);

    const numberOfUsers = new Set(scores.map((s) => s.email).filter((e) => !!e))
      .size;

    return {
      numberOfScores,
      averageCompensation,
      medianCompensation,
      numberOfUsers,
    };
  }
}
