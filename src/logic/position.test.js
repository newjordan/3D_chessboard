import { describe, expect, it } from 'vitest';
import {
  SIMULATION_MOVES,
  applyMove,
  createInitialPosition,
  expandMove,
  findPiece,
  formatMove,
  haloState,
  isWhiteRank,
  playLine,
  resolveMove,
  stampLatestMove,
  startingSetup,
} from './position.js';

const ORIGINAL_MOVES = [
  { fromRank: 6, fromFile: 4, toRank: 4, toFile: 4, capture: false },
  { fromRank: 1, fromFile: 4, toRank: 3, toFile: 4, capture: false },
  { fromRank: 7, fromFile: 6, toRank: 5, toFile: 5, capture: false },
  { fromRank: 1, fromFile: 3, toRank: 3, toFile: 3, capture: false },
  { fromRank: 4, fromFile: 4, toRank: 3, toFile: 3, capture: true },
  { fromRank: 0, fromFile: 3, toRank: 3, toFile: 3, capture: true },
];

describe('opening position', () => {
  it('places the standard 32 pieces, with White on the far ranks', () => {
    const setup = startingSetup();
    expect(setup).toHaveLength(8);
    expect(setup[0]).toEqual(['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']);
    expect(setup[1].every((type) => type === 'P')).toBe(true);
    expect(setup[2].every((type) => type === null)).toBe(true);
    expect(setup[6].every((type) => type === 'P')).toBe(true);
    expect(setup[7]).toEqual(setup[0]);

    const pieces = createInitialPosition();
    expect(pieces).toHaveLength(32);
    expect(pieces.filter((piece) => piece.isWhite)).toHaveLength(16);
    expect(pieces.filter((piece) => !piece.isWhite)).toHaveLength(16);
    expect(isWhiteRank(0)).toBe(false);
    expect(isWhiteRank(6)).toBe(true);

    expect(findPiece(pieces, 7, 4)).toMatchObject({ type: 'K', isWhite: true });
    expect(findPiece(pieces, 0, 4)).toMatchObject({ type: 'K', isWhite: false });
    expect(findPiece(pieces, 6, 4)).toMatchObject({ type: 'P', isWhite: true });
    expect(findPiece(pieces, 1, 4)).toMatchObject({ type: 'P', isWhite: false });
    expect(findPiece(pieces, 4, 4)).toBeNull();
  });
});

describe('demonstration moves', () => {
  it('keeps the original rank and file script', () => {
    expect(SIMULATION_MOVES.map(expandMove)).toMatchObject(ORIGINAL_MOVES);
  });

  it('plays the line, including both captures', () => {
    const start = createInitialPosition();
    let board = start;

    for (const move of SIMULATION_MOVES) {
      const expanded = expandMove(move);
      const { actor } = resolveMove(board, expanded);
      expect(formatMove(actor, expanded)).toBe(
        move.capture ? `${move.from}x${move.to}` : (
          actor.type === 'P' ? `${move.from}-${move.to}` : `${actor.type}${move.from}-${move.to}`
        ),
      );
      board = applyMove(board, move);
    }

    expect(board).toHaveLength(30);
    expect(findPiece(board, 5, 5)).toMatchObject({ type: 'N', isWhite: true, moveAge: 3 });
    expect(findPiece(board, 3, 4)).toMatchObject({ type: 'P', isWhite: false, moveAge: 4 });
    expect(findPiece(board, 3, 3)).toMatchObject({ type: 'Q', isWhite: false, moveAge: 0 });
    expect(findPiece(board, 6, 4)).toBeNull();
    expect(findPiece(board, 4, 4)).toBeNull();
    expect(findPiece(board, 7, 6)).toBeNull();
    expect(findPiece(board, 1, 3)).toBeNull();
    expect(findPiece(board, 0, 3)).toBeNull();
    expect(findPiece(board, 7, 4)).toMatchObject({ type: 'K', isWhite: true });
    expect(board).not.toBe(start);
    expect(findPiece(start, 6, 4)).toMatchObject({ type: 'P', rank: 6, file: 4 });
  });

  it('matches playLine and the history text of the script', () => {
    const board = playLine(SIMULATION_MOVES);
    expect(findPiece(board, 3, 3).type).toBe('Q');

    const start = createInitialPosition();
    expect(formatMove(findPiece(start, 6, 4), SIMULATION_MOVES[0])).toBe('e2-e4');
    expect(formatMove(findPiece(start, 7, 6), SIMULATION_MOVES[2])).toBe('Ng1-f3');
    expect(formatMove({ type: 'P' }, SIMULATION_MOVES[4])).toBe('e4xd5');
    expect(formatMove({ type: 'Q' }, SIMULATION_MOVES[5])).toBe('d8xd5');
  });

  it('rejects empty origins, blocked quiet moves, and illegal captures', () => {
    const pieces = createInitialPosition();
    expect(() => applyMove(pieces, { from: 'e4', to: 'e5', capture: false })).toThrow(/No piece on e4/);
    expect(() => applyMove(pieces, { from: 'e2', to: 'e1', capture: false })).toThrow(/occupied square/);
    expect(() => applyMove(pieces, { from: 'e2', to: 'e4', capture: true })).toThrow(/has no target/);
    expect(() => applyMove(pieces, { from: 'e1', to: 'd1', capture: true })).toThrow(/cannot capture its own piece/);
  });

  it('ages only pieces that have already moved', () => {
    const pieces = createInitialPosition();
    const afterPawn = applyMove(pieces, SIMULATION_MOVES[0]);
    expect(findPiece(afterPawn, 4, 4).moveAge).toBe(0);
    expect(afterPawn.filter((piece) => piece.moveAge !== undefined)).toHaveLength(1);

    const records = [{ moveAge: 1 }, { moveAge: undefined }, { moveAge: 0 }];
    stampLatestMove(records, records[2]);
    expect(records.map((record) => record.moveAge)).toEqual([2, undefined, 0]);
  });
});

describe('move halo', () => {
  it('decays for three generations and then disappears', () => {
    expect(haloState(undefined)).toEqual({ opacity: 0, visible: false });
    expect(haloState(0)).toEqual({ opacity: 1, visible: true });
    expect(haloState(1)).toEqual({ opacity: 0.5, visible: true });
    expect(haloState(2)).toEqual({ opacity: 0.2, visible: true });
    expect(haloState(3)).toEqual({ opacity: 0.05, visible: true });
    expect(haloState(4)).toEqual({ opacity: 0, visible: false });
  });
});
