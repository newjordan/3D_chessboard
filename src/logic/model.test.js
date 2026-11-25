import { describe, expect, it } from 'vitest';
import {
  MAX_FOOTPRINT,
  PIECE_HEIGHTS,
  knightYaw,
  pieceScale,
  uprightRotation,
} from './model.js';

describe('piece mesh fitting', () => {
  it('stands a sideways mesh upright and leaves a vertical mesh alone', () => {
    expect(uprightRotation(4, 1, 2)).toEqual({ axis: 'z', angle: Math.PI / 2 });
    expect(uprightRotation(1, 2, 4)).toEqual({ axis: 'x', angle: Math.PI / 2 });
    expect(uprightRotation(1, 4, 2)).toBeNull();
    expect(uprightRotation(3, 3, 1)).toBeNull();
  });

  it('scales toward the piece height, then caps the footprint at 0.8', () => {
    expect(pieceScale(2, 0.4, 'pawn')).toBe(PIECE_HEIGHTS.pawn / 2);
    expect(pieceScale(1, 0.4, 'king')).toBe(PIECE_HEIGHTS.king);
    expect(pieceScale(1, 0.8, 'king')).toBe(MAX_FOOTPRINT / 0.8);

    const wide = pieceScale(2, 4, 'queen');
    expect(wide).toBe(MAX_FOOTPRINT / 4);
    expect(4 * wide).toBeCloseTo(MAX_FOOTPRINT);
  });

  it('turns knights to face the opposite camp', () => {
    expect(knightYaw(true) - knightYaw(false)).toBe(Math.PI);
    expect(knightYaw(false)).toBe(-Math.PI / 2);
  });
});
