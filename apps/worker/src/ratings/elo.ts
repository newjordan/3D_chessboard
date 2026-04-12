/**
 * Standard Elo expected score calculation.
 */
export function getExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculates the delta for a single engine based on its specific K-Factor.
 */
export function calculateDelta(
  expectedScore: number,
  actualScore: number,
  totalGames: number,
  kFactor: number
): number {
  return Math.round(kFactor * totalGames * (actualScore - expectedScore));
}

/**
 * Updates ratings for a match. 
 * Supports independent K-factors for each engine (e.g., newbie boost).
 */
export function updateRatingsForMatch(
  ratingA: number,
  ratingB: number,
  scoreA: number,
  scoreB: number,
  totalGames: number,
  kA: number = 32,
  kB: number = 32
): { deltaA: number; deltaB: number } {
  const expectedA = getExpectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;

  const actualA = scoreA / totalGames;
  const actualB = scoreB / totalGames;

  const deltaA = calculateDelta(expectedA, actualA, totalGames, kA);
  const deltaB = calculateDelta(expectedB, actualB, totalGames, kB);

  return { deltaA, deltaB };
}
