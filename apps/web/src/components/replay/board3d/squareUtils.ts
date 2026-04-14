/**
 * Converts algebraic chess notation (e.g. "e4") to world-space XZ coordinates.
 * Board is centred at origin. White's back rank (rank 1) is at z = -3.5.
 * File 'a' is at x = -3.5, file 'h' is at x = 3.5.
 */
export function squareToXZ(square: string): { x: number; z: number } {
  const file = square.charCodeAt(0) - 97; // 'a'=0 .. 'h'=7
  const rank = parseInt(square[1]);        // 1..8
  return { x: file - 3.5, z: rank - 4.5 };
}
