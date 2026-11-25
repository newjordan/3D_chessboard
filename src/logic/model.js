/** Target height of each wireframe, in board squares. */
export const PIECE_HEIGHTS = {
  pawn: 0.8,
  rook: 1.0,
  knight: 1.25,
  bishop: 1.4,
  queen: 1.6,
  king: 1.8,
};

/** Widest a piece may be before its height is reduced so it stays on one square. */
export const MAX_FOOTPRINT = 0.8;

export const PIECE_CODE_TO_TYPE = {
  P: 'pawn',
  R: 'rook',
  N: 'knight',
  B: 'bishop',
  Q: 'queen',
  K: 'king',
};

/**
 * Stand a model up when its longest axis is not already vertical.
 * X-major meshes rotate about Z. Z-major meshes rotate about X.
 * A mesh that is already tallest along Y is left alone.
 */
export function uprightRotation(xLen, yLen, zLen) {
  if (xLen > yLen && xLen > zLen) return { axis: 'z', angle: Math.PI / 2 };
  if (zLen > yLen && zLen > xLen) return { axis: 'x', angle: Math.PI / 2 };
  return null;
}

export function pieceScale(ySize, largestFootprint, type) {
  const desiredHeight = PIECE_HEIGHTS[type] ?? 1;
  let scale = desiredHeight / ySize;
  if (largestFootprint * scale > MAX_FOOTPRINT) {
    scale = MAX_FOOTPRINT / largestFootprint;
  }
  return scale;
}

/** Knights face across the board. White and Black are a half-turn apart. */
export function knightYaw(isWhite) {
  return (isWhite ? Math.PI : 0) - Math.PI / 2;
}
