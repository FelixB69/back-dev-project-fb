import * as tf from '@tensorflow/tfjs';
import { Injectable } from '@nestjs/common';
import { SalaryService } from '../salary/salary.service';
import { Salary } from '../salary/salary.entity';
import { Score } from './score.entity';
import { ScoreCalcul } from './score-calcul';

@Injectable()
export class ScoreService {
  // TensorFlow model instance
  private model: tf.Sequential;

  // Promise that resolves when the model is trained and ready
  private modelReady: Promise<void>;

  // Min/max ranges for normalizing input features
  private inputMinMax: {
    xp: [number, number];
    companyXp: [number, number];
    location: [number, number];
  };

  // Min/max range for normalizing the output (compensation)
  private outputMinMax: [number, number];

  constructor(
    private readonly salaryService: SalaryService,
    private readonly scoreCalcul: ScoreCalcul,
  ) {
    // Initialize the model on service creation
    this.modelReady = this.initializeModel();
  }

  // Initializes and trains the TensorFlow model
  private async initializeModel() {
    // Define a simple sequential model with one dense layer
    this.model = tf.sequential();
    this.model.add(tf.layers.dense({ inputShape: [3], units: 1 }));

    // Compile with SGD optimizer and MSE loss
    this.model.compile({
      optimizer: tf.train.sgd(0.01),
      loss: 'meanSquaredError',
    });

    const salaries = await this.salaryService.findAll();

    // Encode location as an index
    const locations = [...new Set(salaries.map((s) => s.location))];
    const locationMap = new Map(locations.map((loc, idx) => [loc, idx]));

    // Extract raw input features
    const inputsRaw = salaries.map((s) => [
      locationMap.get(s.location) ?? 0,
      s.total_xp ?? 0,
      s.company_xp ?? 0,
    ]);

    const outputsRaw = salaries.map((s) => s.compensation);

    // Compute min/max for normalization
    const xpValues = inputsRaw.map((d) => d[1]);
    const companyXpValues = inputsRaw.map((d) => d[2]);
    const locationValues = inputsRaw.map((d) => d[0]);

    this.inputMinMax = {
      xp: [Math.min(...xpValues), Math.max(...xpValues)],
      companyXp: [Math.min(...companyXpValues), Math.max(...companyXpValues)],
      location: [Math.min(...locationValues), Math.max(...locationValues)],
    };

    this.outputMinMax = [Math.min(...outputsRaw), Math.max(...outputsRaw)];

    // Normalize input data
    const inputs = inputsRaw.map(([loc, xp, compXp]) => [
      this.normalizeValue(loc, ...this.inputMinMax.location),
      this.normalizeValue(xp, ...this.inputMinMax.xp),
      this.normalizeValue(compXp, ...this.inputMinMax.companyXp),
    ]);

    // Normalize output data
    const outputs = outputsRaw.map((c) => [
      this.normalizeValue(c, ...this.outputMinMax),
    ]);

    // Convert data to tensors
    const inputTensor = tf.tensor2d(inputs);
    const outputTensor = tf.tensor2d(outputs);

    // Train the model
    await this.model.fit(inputTensor, outputTensor, {
      epochs: 100,
    });
  }

  // Convert a location string to its corresponding index
  private async locationToIndex(location: string): Promise<number> {
    const salaries = await this.salaryService.findAll();
    const locations = [...new Set(salaries.map((salary) => salary.location))];
    return locations.indexOf(location);
  }

  // Normalize a value between 0 and 1
  private normalizeValue(value: number, min: number, max: number): number {
    return (value - min) / (max - min);
  }

  // Compare a profile with another to compute a similarity score
  private async calculateSimilarityScore(comparison: Score): Promise<number> {
    const predicted = await this.predictCompensation(comparison);
    const actual = comparison.compensation;

    const score =
      actual === 0 ? 0 : 1 - Math.abs((actual - predicted) / actual); // comme coherenceScore

    return score;
  }

  // Compare predicted vs actual salary to assess coherence
  public async calculateCoherenceScore(target: Score): Promise<number> {
    const predictedCompensation = await this.predictCompensation(target);
    const actualCompensation = target.compensation;

    const coherenceScore =
      actualCompensation === 0
        ? 0
        : 1 -
          Math.abs(
            (actualCompensation - predictedCompensation) / actualCompensation,
          );

    return coherenceScore;
  }

  // Predict salary using the model for a given profile
  private async predictCompensation(target: Score): Promise<number> {
    await this.modelReady;

    const locationIndex = await this.locationToIndex(target.location);

    // Normalize input features
    const inputNorm = [
      this.normalizeValue(locationIndex, ...this.inputMinMax.location),
      this.normalizeValue(target.total_xp ?? 0, ...this.inputMinMax.xp),
      this.normalizeValue(
        target.company_xp ?? 0,
        ...this.inputMinMax.companyXp,
      ),
    ];

    // Predict and denormalize output
    const inputTensor = tf.tensor2d([inputNorm]);
    const prediction = this.model.predict(inputTensor) as tf.Tensor;
    const normValue = prediction.dataSync()[0];
    const denormValue =
      normValue * (this.outputMinMax[1] - this.outputMinMax[0]) +
      this.outputMinMax[0];

    return denormValue;
  }

  // Compute full salary statistics for a given profile
  public async calculateStatistics(target: Score): Promise<any> {
    const salaries = await this.salaryService.findAll();

    const scores = await Promise.all(
      salaries.map((comparison) => {
        const infos = {
          location: comparison.location,
          total_xp: comparison.total_xp,
          company_xp: comparison.company_xp,
          compensation: comparison.compensation,
          id: comparison.id,
          createdAt: comparison.date,
        };

        return this.calculateSimilarityScore(infos); // ← il faut le `return` ici !
      }),
    );

    const meanScore = this.scoreCalcul.calculateMean(scores);
    const stdScore = this.scoreCalcul.calculateStd(scores, meanScore);

    const coherenceScore = await this.calculateCoherenceScore(target);
    const predictedCompensation = await this.predictCompensation(target);
    const actualCompensation = target.compensation;

    const salaryValues = salaries
      .map((s) => s.compensation)
      .sort((a, b) => a - b);
    const percentileRank = this.scoreCalcul.getPercentileRank(
      salaryValues,
      actualCompensation,
    );

    const numHigher = scores.filter((s) => s > coherenceScore).length;
    const numLower = scores.filter((s) => s < coherenceScore).length;
    const similarPercentage = Math.round(
      (numLower / (numHigher + numLower)) * 100,
    );

    const coherenceComment =
      coherenceScore > 0.8
        ? 'Ton salaire est parfaitement cohérent avec ton parcours'
        : coherenceScore > 0.6
          ? 'Ton salaire est globalement cohérent avec ton parcours'
          : coherenceScore > 0.4
            ? 'Ton salaire semble un peu décalé par rapport à ton profil'
            : 'Ton salaire est très atypique par rapport à ton profil';

    const averageByXp = this.computeAverageSalaryByExperience(salaries);

    return {
      diagnostic: {
        title:
          coherenceScore > 0.8
            ? 'Parfaitement aligné 👌'
            : coherenceScore > 0.6
              ? 'Globalement cohérent ✅'
              : coherenceScore > 0.4
                ? 'Léger décalage 🤔'
                : 'Atypique 🔎',
        icon:
          coherenceScore > 0.8
            ? '👌'
            : coherenceScore > 0.6
              ? '✅'
              : coherenceScore > 0.4
                ? '🤔'
                : '🔎',
        description: coherenceComment,
      },

      estimatedGap: {
        predicted: Math.round(predictedCompensation),
        actual: Math.round(actualCompensation),
        difference: Math.round(actualCompensation - predictedCompensation),
        percentage: +(
          ((actualCompensation - predictedCompensation) /
            predictedCompensation) *
          100
        ).toFixed(1),
        comment:
          actualCompensation > predictedCompensation
            ? 'Tu gagnes plus que ce qui est estimé pour ton profil.'
            : actualCompensation < predictedCompensation
              ? 'Tu gagnes moins que ce qui est estimé pour ton profil.'
              : 'Tu gagnes exactement ce qui est attendu.',
      },

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
        comparison: `Tu gagnes plus que ${similarPercentage}% des personnes avec un profil comparable.`,
      },

      conseil:
        coherenceScore > 0.7 &&
        actualCompensation < predictedCompensation &&
        (predictedCompensation - actualCompensation) / predictedCompensation >
          0.1
          ? 'Tu pourrais envisager de négocier une revalorisation salariale.'
          : 'Reste dans ta zone de confort et continue de progresser dans ta carrière',

      coherenceScore,
      meanScore,
      stdScore,

      chartData: {
        averageByXp,
        histogram: this.buildHistogram(scores, 10),
      },
    };
  }

  private computeAverageSalaryByExperience(
    data: Salary[],
  ): { xp: number; average: number }[] {
    const grouped = new Map<number, number[]>();

    for (const item of data) {
      const xp = Math.round(item.total_xp ?? 0);
      if (!grouped.has(xp)) grouped.set(xp, []);
      grouped.get(xp)?.push(item.compensation);
    }

    const result = [...grouped.entries()].map(([xp, comps]) => ({
      xp,
      average: Math.round(comps.reduce((a, b) => a + b, 0) / comps.length),
    }));

    return result.sort((a, b) => a.xp - b.xp);
  }

  // Build histogram from score distribution
  private buildHistogram(
    values: number[],
    numBuckets: number,
  ): { range: string; count: number }[] {
    const buckets = Array(numBuckets).fill(0);
    for (const v of values) {
      const idx = Math.min(Math.floor(v * numBuckets), numBuckets - 1);
      buckets[idx]++;
    }

    return buckets.map((count, i) => ({
      range: `${(i / numBuckets).toFixed(1)}–${((i + 1) / numBuckets).toFixed(1)}`,
      count,
    }));
  }
}
