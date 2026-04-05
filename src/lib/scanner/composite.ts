/**
 * Weighted composite score from all 6 criteria.
 */

import type { CriteriaScores } from "../types";

const WEIGHTS = {
  ivPercentile: 0.25,
  skewKurtosis: 0.20,
  dealerGamma: 0.20,
  termStructure: 0.15,
  vanna: 0.10,
  charm: 0.10,
} as const;

export function computeCompositeScore(criteria: CriteriaScores): number {
  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    score += criteria[key as keyof CriteriaScores].score * weight;
  }
  return Math.round(score * 1000) / 1000;
}
