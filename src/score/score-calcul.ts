export class ScoreCalcul {
  // Mean calculation
  public calculateMean(scores: number[]): number {
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  // Standard deviation calculation
  public calculateStd(scores: number[], mean: number): number {
    const variance =
      scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
      scores.length;
    return Math.sqrt(variance);
  }

  // Median calculation
  public calculateMedian(scores: number[]): number {
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Calculate quartiles (Q1, Q2, Q3)
  public calculateQuartiles(scores: number[]): number[] {
    const sorted = [...scores].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q2 = this.percentile(sorted, 50);
    const q3 = this.percentile(sorted, 75);
    return [q1, q2, q3];
  }

  // Common percentiles (p10, p25, p50, etc.)
  public calculateCommonPercentiles(scores: number[]): Record<string, number> {
    const sorted = [...scores].sort((a, b) => a - b);
    return {
      p10: this.percentile(sorted, 10),
      p25: this.percentile(sorted, 25),
      p50: this.percentile(sorted, 50),
      p75: this.percentile(sorted, 75),
      p90: this.percentile(sorted, 90),
    };
  }

  // Interpolated percentile calculation
  public percentile(sorted: number[], percentile: number): number {
    const index = (sorted.length - 1) * (percentile / 100);
    const lower = Math.floor(index);
    const upper = lower + 1;
    const weight = index - lower;

    if (upper >= sorted.length) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  // Calculate the percentile rank of a value
  public getPercentileRank(sorted: number[], value: number): number {
    const below = sorted.filter((v) => v < value).length;
    return Math.round((below / sorted.length) * 100);
  }

  public normalizeValue(v: number): number {
    return Math.max(0, Math.min(1, v));
  }
}
