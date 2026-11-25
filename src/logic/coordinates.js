/** Squares per side of the board. */
export const BOARD_SQUARES = 8;

/** World size of one square. The mesh grid is built from this length. */
export const SQUARE_SIZE = 1;

/** Files, left to right, matching the A–H edge of the board. */
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/**
 * Distance from the board center to the outer grid line.
 * Square centers sit half a square in from that line.
 */
export function boardOffset(squareSize = SQUARE_SIZE, squares = BOARD_SQUARES) {
  return (squareSize * squares) / 2;
}

/**
 * Rank index 0 is chess rank 8 (Black's back rank, the near edge of the
 * default camera). Rank index 7 is chess rank 1 (White's back rank).
 * The engraved rank numerals on the frame are a separate decoration.
 */
export function squareToWorld(rank, file, offset = boardOffset()) {
  const half = SQUARE_SIZE / 2;
  return {
    x: file * SQUARE_SIZE - (offset - half),
    y: 0,
    z: (offset - half) - rank * SQUARE_SIZE,
  };
}

export function worldToSquare(x, z, offset = boardOffset()) {
  const half = SQUARE_SIZE / 2;
  return {
    file: Math.round(x + (offset - half)),
    rank: Math.round((offset - half) - z),
  };
}

export function inBounds(rank, file) {
  return rank >= 0 && rank < BOARD_SQUARES && file >= 0 && file < BOARD_SQUARES;
}

export function toAlgebraic(rank, file) {
  if (!inBounds(rank, file)) {
    throw new Error(`Square out of range: rank ${rank}, file ${file}`);
  }
  return `${FILES[file]}${BOARD_SQUARES - rank}`;
}

export function fromAlgebraic(square) {
  const match = /^([a-h])([1-8])$/i.exec(String(square).trim());
  if (!match) {
    throw new Error(`Invalid square: ${square}`);
  }
  const file = FILES.indexOf(match[1].toLowerCase());
  const chessRank = Number(match[2]);
  return { file, rank: BOARD_SQUARES - chessRank };
}
