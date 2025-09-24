import * as tf from '@tensorflow/tfjs';
import { Injectable, NotFoundException } from '@nestjs/common';
import { SalaryService } from '../salary/salary.service';
import { Salary } from '../salary/salary.entity';
import { Score } from './score.entity';
import { ScoreCalcul } from './score-calcul';
import { CreateScoreDto } from './create-score.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScoreResult } from './score-result.entity';
@Injectable()
export class ScoreService {
  private model: tf.LayersModel;
  private modelReady: Promise<void>;

  // Cache to avoid retraining on each request
  private trainCache: {
    salaries: Salary[];
    locations: string[];
    locationMap: Map<string, number>;
  } | null = null;

  private numLocations = 0;

  // we keep only 2 features: locationIndex & total_xp
  private inputMinMax: {
    location: [number, number];
    xp: [number, number];
  };

  private outputMinMax: [number, number];

  // persistence available if tfjs-node
  private readonly enableModelPersistence = !!(tf as any).node;
  private readonly modelPath = 'file://./models/score-model-2f';

  // Similarity weights (can be injected via config if needed)
  private readonly wLocation = 0.6;
  private readonly wXp = 0.4;
  // Width (standard deviation) for the Gaussian kernel in years
  private readonly sigmaXp = 2; // ~ 2 years ⇒ reasonable decay

  constructor(
    private readonly salaryService: SalaryService,
    private readonly scoreCalcul: ScoreCalcul,
    @InjectRepository(Score)
    private readonly scoreRepository: Repository<Score>,
    @InjectRepository(ScoreResult)
    private readonly scoreResultRepository: Repository<ScoreResult>, // <—
  ) {
    this.modelReady = this.bootstrapModel();
  }

  private async bootstrapModel() {
    try {
      if (this.enableModelPersistence) {
        this.model = await tf.loadLayersModel(`${this.modelPath}/model.json`);
        console.log('Modèle chargé depuis le disque.');
        await this.initializeAndTrain(true); // recalc min/max + maps
        return;
      }
    } catch (e) {
      console.warn(`Chargement du modèle impossible: ${e}`);
    }
    await this.initializeAndTrain(false);
  }

  public async refreshModel(): Promise<void> {
    this.modelReady = this.initializeAndTrain(false);
    await this.modelReady;
  }

  private async initializeAndTrain(warmStatsOnly: boolean) {
    const salaries = await this.salaryService.findAll();
    if (!salaries || salaries.length < 5) {
      this.numLocations = 1;
      this.model = tf.sequential({
        layers: [
          tf.layers.dense({ inputShape: [this.numLocations + 1], units: 1 }),
        ],
      });
      this.model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'meanAbsoluteError',
      });
      this.inputMinMax = { xp: [0, 1], location: [0, 1] };
      this.outputMinMax = [0, 1];
      this.trainCache = {
        salaries: [],
        locations: ['other'],
        locationMap: new Map([['other', 0]]),
      };
      return;
    }

    const uniqueLocations = [
      ...new Set(salaries.map((s) => s.location).filter(Boolean)),
    ];
    const locations = [
      'other',
      ...uniqueLocations.filter((l) => l !== 'other'),
    ];
    const locationMap = new Map(locations.map((loc, idx) => [loc, idx]));
    this.numLocations = locations.length;

    // bruts features : [locationIndex, total_xp]
    const inputsRaw = salaries.map((s) => [
      locationMap.get(s.location ?? 'other') ?? 0,
      s.total_xp ?? 0,
    ]);
    const outputsRaw = salaries.map((s) => s.compensation);

    const col = (arr: number[][], i: number) => arr.map((r) => r[i]);
    const makeMinMax = (values: number[]): [number, number] => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      return min === max ? ([min, min + 1] as [number, number]) : [min, max];
    };

    // In one-hot, we normalize only xp (city will be binary)
    this.inputMinMax = {
      location: [0, 1], // kept for compatibility, not used
      xp: makeMinMax(col(inputsRaw, 1)),
    };
    this.outputMinMax = makeMinMax(outputsRaw);

    const normalize = (v: number, [min, max]: [number, number]) => {
      const z = (v - min) / (max - min);
      return Math.max(0, Math.min(1, z));
    };

    // Helpers one-hot
    const toOneHot = (i: number) =>
      Array.from({ length: this.numLocations }, (_, k) => (k === i ? 1 : 0));

    // Final entries: [...oneHot(loc), xpNorm]
    const inputs = inputsRaw.map(([locIdx, xp]) => [
      ...toOneHot(locIdx),
      normalize(xp, this.inputMinMax.xp),
    ]);
    const outputs = outputsRaw.map((c) => [normalize(c, this.outputMinMax)]);

    const x = tf.tensor2d(inputs);
    const y = tf.tensor2d(outputs);

    if (!this.model || !warmStatsOnly) {
      // MLP adapted to the new input dimension
      const model = tf.sequential();
      model.add(
        tf.layers.dense({
          inputShape: [this.numLocations + 1], // <— L (one-hot) + 1 (xp)
          units: 64,
          activation: 'relu',
        }),
      );
      model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
      model.add(tf.layers.dense({ units: 1 }));
      model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'meanAbsoluteError',
        metrics: ['mse'],
      });

      // Early stopping inchangé
      let best = Number.POSITIVE_INFINITY;
      let patience = 0;
      const maxPatience = 10;
      const epochs = 200;

      for (let e = 0; e < epochs; e++) {
        const h = await model.fit(x, y, {
          batchSize: 32,
          epochs: 1,
          validationSplit: 0.1,
          shuffle: true,
          verbose: 0,
        });
        const val =
          (h.history.val_loss?.[0] as number) ??
          (h.history.loss?.[0] as number) ??
          Infinity;
        if (val + 1e-6 < best) {
          best = val;
          patience = 0;
        } else if (++patience >= maxPatience) {
          console.log(`Early stopping @${e}`);
          break;
        }
      }

      this.model = model;

      try {
        if (this.enableModelPersistence) {
          await this.model.save(this.modelPath);
          console.log('Modèle sauvegardé sur le disque.');
        }
      } catch (e) {
        console.warn(`Sauvegarde du modèle impossible: ${e}`);
      }
    }

    this.trainCache = { salaries, locations, locationMap };

    x.dispose();
    y.dispose();
  }

  private locationToIndex(location: string): number {
    const idx = this.trainCache?.locationMap.get(location ?? 'other');
    return typeof idx === 'number' ? idx : 0; // other
  }

  private normalizeValue(value: number, min: number, max: number): number {
    if (min === max) return 0;
    const z = (value - min) / (max - min);
    return Math.max(0, Math.min(1, z));
  }

  private bound01(v: number) {
    return Math.max(0, Math.min(1, v));
  }

  // ---------- PREDICTION (based on 2 features) ----------
  private async predictCompensation(target: Score): Promise<number> {
    await this.modelReady;

    const locIdx = this.locationToIndex(target.location);
    const xpNorm = this.normalizeValue(
      target.total_xp ?? 0,
      ...this.inputMinMax.xp,
    );

    // one-hot for inference
    const oneHot = Array.from({ length: this.numLocations }, (_, k) =>
      k === locIdx ? 1 : 0,
    );
    const input = [...oneHot, xpNorm];

    const inputTensor = tf.tensor2d([input]);
    const prediction = this.model.predict(inputTensor) as tf.Tensor;
    const normValue = (await prediction.data())[0];
    inputTensor.dispose();
    prediction.dispose();

    const [omin, omax] = this.outputMinMax;
    return normValue * (omax - omin) + omin;
  }

  // ---------- Similarity (ONLY location & xp) ----------
  /**
   * Similarity feature-based :
   *  - locationSim: 1 if same city; otherwise decay ~ exp(-d^2/2)
   *  - xpSim:       exp(- (Δxp)^2 / (2*sigma^2))
   * Final score: wLocation*locationSim + wXp*xpSim  (bounded [0,1])
   */
  private featureSimilarity(
    a: { location: string; xp: number },
    b: { location: string; xp: number },
  ): number {
    const ia = this.locationToIndex(a.location);
    const ib = this.locationToIndex(b.location);
    const dLoc = Math.abs(ia - ib);

    // If same location ⇒ 1 ; otherwise soft decay according to index distance
    const locationSim = Math.exp(-(dLoc * dLoc) / 2);

    const dx = (a.xp ?? 0) - (b.xp ?? 0);
    const xpSim = Math.exp(-((dx * dx) / (2 * this.sigmaXp * this.sigmaXp)));

    const s = this.wLocation * locationSim + this.wXp * xpSim;
    return this.bound01(s);
  }

  // ---------- Similarity (alignée sur la cohérence) ----------
  /**
   * Measures the proximity of a "comparison" salary to the salary
   * expected for the target profile, using the SAME metric as consistency:
   * score = 1 - |actual - predicted| / actual (bounded at [0,1])
   * Here, "predicted" is the model's prediction for the target.
   */
  private async calculateSimilarityScore(
    comparison: Score,
    target: Score,
  ): Promise<number> {
    await this.modelReady;
    const predictedForTarget = await this.predictCompensation(target);

    const actual = comparison.compensation ?? 0;
    if (actual <= 0) return 0;

    const relErr = Math.abs(actual - predictedForTarget) / actual;
    return this.bound01(1 - relErr);
  }

  // Coherence (relative salary error, unchanged)
  public async calculateCoherenceScore(target: Score): Promise<number> {
    const predicted = await this.predictCompensation(target);
    const actual = target.compensation;
    const raw = actual === 0 ? 0 : 1 - Math.abs((actual - predicted) / actual);
    return this.bound01(raw);
  }

  // ---------- STATISTICS ----------
  public async calculateStatistics(target: Score): Promise<any> {
    await this.modelReady;

    // save score
    await this.createScore({
      location: target.location,
      total_xp: target.total_xp,
      compensation: target.compensation,
      email: target.email,
      consent: target.consent,
    });

    const salaries =
      this.trainCache?.salaries ?? (await this.salaryService.findAll());

    // purely similarity distribution (location,xp) relative to the target
    const scores = await Promise.all(
      salaries.map(async (s) => {
        const comp: Score = {
          location: s.location,
          total_xp: s.total_xp,
          compensation: s.compensation,
        } as any;
        return this.calculateSimilarityScore(comp, target);
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

    // comparison: % of profiles (by location/near xp) below
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
        wLocation: this.wLocation,
        wXp: this.wXp,
        sigmaXp: this.sigmaXp,
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
        locations: this.trainCache?.locations ?? [],
        inputMinMax: this.inputMinMax,
        outputMinMax: this.outputMinMax,
      },
    };
  }

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
      const z = this.bound01(v);
      const idx = Math.min(Math.floor(z * numBuckets), numBuckets - 1);
      buckets[idx]++;
    }
    return buckets.map((count, i) => ({
      range: `${(i / numBuckets).toFixed(1)}–${((i + 1) / numBuckets).toFixed(1)}`,
      count,
    }));
  }

  async createScore(createScoreDto: CreateScoreDto) {
    const newScore = this.scoreRepository.create({
      ...createScoreDto,
      createdAt: new Date(),
    });
    return await this.scoreRepository.save(newScore);
  }

  /**
   * Calcule les stats, les sauvegarde en base et renvoie { id, ...output }.
   * Le front peut stocker l’id et relire plus tard le même résultat.
   */
  public async analyzeAndSave(dto: CreateScoreDto) {
    // On construit un "target" minimal pour réutiliser votre pipeline
    const target: Score = {
      location: dto.location,
      total_xp: dto.total_xp ?? 0,
      compensation: dto.compensation,
      email: dto.email,
      consent: dto.consent,
    } as any;

    // Calcule toutes les stats avec votre logique existante
    const output = await this.calculateStatistics(target);

    // Persistance en 1 ligne (input + output)
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

    // Retourne l’id + le résultat au front immédiatement
    return { id: saved.id, ...output };
  }

  /** Récupère l’analyse complète par id (pour le front) */
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

  async findAll(): Promise<Score[]> {
    return await this.scoreRepository.find();
  }

  async findByEmail(email: string) {
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
}
