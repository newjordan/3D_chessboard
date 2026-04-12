/**
 * Standard Elo calculation utility.
 */
export function calculateEloChange(
  ratingA: number,
  ratingB: number,
  scoreA: number, // 1 for win, 0.5 for draw, 0 for loss
  kFactor: number = 64
): number {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  return Math.round(kFactor * (scoreA - expectedA));
}

/**
 * Updates ratings for multiple games in a match string.
 */
export function updateRatingsForMatch(
  ratingA: number,
  ratingB: number,
  scoreA: number, // Sum of points for A (e.g., 2.5)
  scoreB: number, // Sum of points for B (e.g., 1.5)
  totalGames: number,
  kFactor: number = 64
): { deltaA: number; deltaB: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const actualA = scoreA / totalGames;
  
  const deltaA = Math.round(kFactor * totalGames * (actualA - expectedA));
  const deltaB = -deltaA; // Elo is zero-sum

  return { deltaA, deltaB };
}
