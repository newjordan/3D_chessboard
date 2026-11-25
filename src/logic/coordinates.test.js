import { describe, expect, it } from 'vitest';
import {
  boardOffset,
  fromAlgebraic,
  squareToWorld,
  toAlgebraic,
  worldToSquare,
} from './coordinates.js';

describe('board coordinates', () => {
  it('centers an 8x8 board on the origin', () => {
    expect(boardOffset()).toBe(4);
  });

  it('maps the demonstration squares onto the original world positions', () => {
    expect(squareToWorld(6, 4)).toEqual({ x: 0.5, y: 0, z: -2.5 });
    expect(squareToWorld(4, 4)).toEqual({ x: 0.5, y: 0, z: -0.5 });
    expect(squareToWorld(7, 6)).toEqual({ x: 2.5, y: 0, z: -3.5 });
    expect(squareToWorld(0, 0)).toEqual({ x: -3.5, y: 0, z: 3.5 });
    expect(squareToWorld(7, 7)).toEqual({ x: 3.5, y: 0, z: -3.5 });
  });

  it('round-trips every square through world space', () => {
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const world = squareToWorld(rank, file);
        expect(worldToSquare(world.x, world.z)).toEqual({ rank, file });
      }
    }
  });

  it('spaces neighboring squares one unit apart', () => {
    const a1 = squareToWorld(7, 0);
    const b1 = squareToWorld(7, 1);
    const a2 = squareToWorld(6, 0);
    expect(b1.x - a1.x).toBe(1);
    expect(a2.z - a1.z).toBe(1);
  });

  it('uses standard algebraic names for the scripted squares', () => {
    expect(toAlgebraic(6, 4)).toBe('e2');
    expect(toAlgebraic(1, 4)).toBe('e7');
    expect(toAlgebraic(7, 6)).toBe('g1');
    expect(toAlgebraic(5, 5)).toBe('f3');
    expect(toAlgebraic(0, 3)).toBe('d8');
    expect(toAlgebraic(3, 3)).toBe('d5');
    expect(fromAlgebraic('E2')).toEqual({ rank: 6, file: 4 });
    expect(fromAlgebraic('a1')).toEqual({ rank: 7, file: 0 });
    expect(fromAlgebraic('h8')).toEqual({ rank: 0, file: 7 });
  });

  it('rejects squares that are not on the board', () => {
    expect(() => toAlgebraic(8, 0)).toThrow(/out of range/);
    expect(() => toAlgebraic(-1, 3)).toThrow(/out of range/);
    expect(() => fromAlgebraic('i1')).toThrow(/Invalid square/);
    expect(() => fromAlgebraic('a9')).toThrow(/Invalid square/);
    expect(() => fromAlgebraic('e')).toThrow(/Invalid square/);
  });
});
