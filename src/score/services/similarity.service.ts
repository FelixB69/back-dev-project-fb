import { Injectable } from '@nestjs/common';
import { Score } from '../entities/score.entity';
import { MlModelService } from './ml-model.service';
import { ScoreCalcul } from '../score-calcul';

@Injectable()
export class SimilarityService {
  // Similarity weights (can be injected via config if needed)
  public readonly wLocation = 0.6;
  public readonly wXp = 0.4;
  // Width (standard deviation) for the Gaussian kernel in years
  public readonly sigmaXp = 2; // ~ 2 years ⇒ reasonable decay

  constructor(
    private readonly mlModel: MlModelService,
    private readonly scoreCalcul: ScoreCalcul,
  ) {}

  // ---------- Similarity (ONLY location & xp) ----------
  /**
   * Similarity feature-based :
   *  - locationSim: 1 if same city; otherwise decay ~ exp(-d^2/2)
   *  - xpSim:       exp(- (Δxp)^2 / (2*sigma^2))
   * Final score: wLocation*locationSim + wXp*xpSim  (bounded [0,1])
   */
  public featureSimilarity(
    a: { location: string; xp: number },
    b: { location: string; xp: number },
  ): number {
    const ia = this.mlModel.locationToIndex(a.location);
    const ib = this.mlModel.locationToIndex(b.location);
    const dLoc = Math.abs(ia - ib);

    // If same location ⇒ 1 ; otherwise soft decay according to index distance
    const locationSim = Math.exp(-(dLoc * dLoc) / 2);

    const dx = (a.xp ?? 0) - (b.xp ?? 0);
    const xpSim = Math.exp(-((dx * dx) / (2 * this.sigmaXp * this.sigmaXp)));

    const s = this.wLocation * locationSim + this.wXp * xpSim;
    return this.scoreCalcul.normalizeValue(s);
  }

  // ---------- Similarity (alignée sur la cohérence) ----------
  /**
   * Measures the proximity of a "comparison" salary to the salary
   * expected for the target profile, using the SAME metric as consistency:
   * score = 1 - |actual - predicted| / actual (bounded at [0,1])
   * Here, "predicted" is the model's prediction for the target.
   */
  public async calculateSimilarityScore(
    comparison: Score,
    target: Score,
  ): Promise<number> {
    const predictedForTarget = await this.mlModel.predictCompensation(
      target as any,
    );

    const actual = comparison.compensation ?? 0;
    if (actual <= 0) return 0;

    const relErr = Math.abs(actual - predictedForTarget) / actual;
    return this.scoreCalcul.normalizeValue(1 - relErr);
  }
}
