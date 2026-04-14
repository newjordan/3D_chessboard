"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExpectedScore = getExpectedScore;
exports.calculateDelta = calculateDelta;
exports.updateRatingsForMatch = updateRatingsForMatch;
/**
 * Standard Elo expected score calculation.
 */
function getExpectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
/**
 * Calculates the delta for a single engine based on its specific K-Factor.
 */
function calculateDelta(expectedScore, actualScore, totalGames, kFactor) {
    return Math.round(kFactor * totalGames * (actualScore - expectedScore));
}
/**
 * Updates ratings for a match.
 * Supports independent K-factors for each engine (e.g., newbie boost).
 */
function updateRatingsForMatch(ratingA, ratingB, scoreA, scoreB, totalGames, kA = 32, kB = 32) {
    const expectedA = getExpectedScore(ratingA, ratingB);
    const expectedB = 1 - expectedA;
    const actualA = scoreA / totalGames;
    const actualB = scoreB / totalGames;
    const deltaA = calculateDelta(expectedA, actualA, totalGames, kA);
    const deltaB = calculateDelta(expectedB, actualB, totalGames, kB);
    return { deltaA, deltaB };
}
