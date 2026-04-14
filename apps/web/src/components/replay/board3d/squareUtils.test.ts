import { describe, test, expect } from 'vitest';
import { squareToXZ } from './squareUtils';

describe('squareToXZ', () => {
  test('a1 → white back-rank corner', () => {
    expect(squareToXZ('a1')).toEqual({ x: -3.5, z: -3.5 });
  });

  test('h8 → black back-rank corner', () => {
    expect(squareToXZ('h8')).toEqual({ x: 3.5, z: 3.5 });
  });

  test('e4 → near center', () => {
    expect(squareToXZ('e4')).toEqual({ x: 0.5, z: -0.5 });
  });

  test('a8 → black queen-rook start', () => {
    expect(squareToXZ('a8')).toEqual({ x: -3.5, z: 3.5 });
  });

  test('h1 → white king-rook start', () => {
    expect(squareToXZ('h1')).toEqual({ x: 3.5, z: -3.5 });
  });
});
