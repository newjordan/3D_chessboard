"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateEloChange = calculateEloChange;
exports.updateRatingsForMatch = updateRatingsForMatch;
/**
 * Standard Elo calculation utility.
 */
function calculateEloChange(ratingA, ratingB, scoreA, // 1 for win, 0.5 for draw, 0 for loss
kFactor = 32) {
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    return Math.round(kFactor * (scoreA - expectedA));
}
/**
 * Updates ratings for multiple games in a match string.
 */
function updateRatingsForMatch(ratingA, ratingB, scoreA, // Sum of points for A (e.g., 2.5)
scoreB, // Sum of points for B (e.g., 1.5)
totalGames, kFactor = 32) {
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const actualA = scoreA / totalGames;
    const deltaA = Math.round(kFactor * totalGames * (actualA - expectedA));
    const deltaB = -deltaA; // Elo is zero-sum
    return { deltaA, deltaB };
}
