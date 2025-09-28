import * as tf from '@tensorflow/tfjs';
import { Injectable } from '@nestjs/common';
import { SalaryService } from '../../salary/salary.service';
import { Salary } from '../../salary/entities/salary.entity';

@Injectable()
export class MlModelService {
  public model: tf.LayersModel;
  public modelReady: Promise<void>;

  // Cache to avoid retraining on each request
  public trainCache: {
    salaries: Salary[];
    locations: string[];
    locationMap: Map<string, number>;
  } | null = null;

  public numLocations = 0;

  // we keep only 2 features: locationIndex & total_xp
  public inputMinMax: {
    location: [number, number];
    xp: [number, number];
  };

  public outputMinMax: [number, number];

  // persistence available if tfjs-node
  private readonly enableModelPersistence = !!(tf as any).node;
  private readonly modelPath = 'file://./models/score-model-2f';

  constructor(private readonly salaryService: SalaryService) {
    this.modelReady = this.bootstrapModel();
  }

  public async bootstrapModel() {
    try {
      if (this.enableModelPersistence) {
        this.model = await tf.loadLayersModel(`${this.modelPath}/model.json`);
        console.log('Modèle chargé depuis le disque.');
        await this.initializeAndTrain(true);
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

  public async initializeAndTrain(warmStatsOnly: boolean) {
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

    this.inputMinMax = {
      location: [0, 1],
      xp: makeMinMax(col(inputsRaw, 1)),
    };
    this.outputMinMax = makeMinMax(outputsRaw);

    const normalize = (v: number, [min, max]: [number, number]) => {
      const z = (v - min) / (max - min);
      return Math.max(0, Math.min(1, z));
    };

    const toOneHot = (i: number) =>
      Array.from({ length: this.numLocations }, (_, k) => (k === i ? 1 : 0));

    const inputs = inputsRaw.map(([locIdx, xp]) => [
      ...toOneHot(locIdx),
      normalize(xp, this.inputMinMax.xp),
    ]);
    const outputs = outputsRaw.map((c) => [normalize(c, this.outputMinMax)]);

    const x = tf.tensor2d(inputs);
    const y = tf.tensor2d(outputs);

    if (!this.model || !warmStatsOnly) {
      const model = tf.sequential();
      model.add(
        tf.layers.dense({
          inputShape: [this.numLocations + 1],
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

  public locationToIndex(location: string): number {
    const idx = this.trainCache?.locationMap.get(location ?? 'other');
    return typeof idx === 'number' ? idx : 0;
  }

  public normalizeValue(value: number, min: number, max: number): number {
    if (min === max) return 0;
    const z = (value - min) / (max - min);
    return Math.max(0, Math.min(1, z));
  }

  public async predictCompensation(target: {
    location: string;
    total_xp?: number;
  }): Promise<number> {
    await this.modelReady;

    const locIdx = this.locationToIndex(target.location);
    const xpNorm = this.normalizeValue(
      target.total_xp ?? 0,
      ...this.inputMinMax.xp,
    );

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
}
