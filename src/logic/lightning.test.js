import { describe, expect, it } from 'vitest';
import { squareToWorld } from './coordinates.js';
import { lightningCorners, lightningUvs, pointAlongLightning } from './lightning.js';

describe('lightning crawl', () => {
  it('walks the long diagonal along Z first, then X', () => {
    const corners = lightningCorners(squareToWorld(7, 0), squareToWorld(0, 7));
    expect(corners.snap).toEqual({ x: -3, z: -3 });
    expect(corners.target).toEqual({ x: 3, z: 3 });
    expect(corners.distZ).toBe(6);
    expect(corners.distX).toBe(6);
    expect(lightningUvs(corners.distZ, corners.total)).toEqual([0, 0, 0.5, 0, 1, 0]);

    expect(pointAlongLightning(corners, 0)).toEqual({ x: -3, z: -3 });
    expect(pointAlongLightning(corners, 0.25)).toEqual({ x: -3, z: 0 });
    expect(pointAlongLightning(corners, 0.5)).toEqual({ x: -3, z: 3 });
    expect(pointAlongLightning(corners, 0.75)).toEqual({ x: 0, z: 3 });
    expect(pointAlongLightning(corners, 1)).toEqual({ x: 3, z: 3 });
  });

  it('keeps a straight pawn push on the negative corner when file does not change', () => {
    const corners = lightningCorners(squareToWorld(6, 4), squareToWorld(4, 4));
    expect(corners.snap).toEqual({ x: 0, z: -2 });
    expect(corners.target).toEqual({ x: 1, z: -1 });
    expect(pointAlongLightning(corners, 0).x).toBe(0);
    expect(pointAlongLightning(corners, 1)).toEqual({ x: 1, z: -1 });
  });

  it('stays put when the two corners are the same point', () => {
    const corners = { snap: { x: 1, z: 2 }, target: { x: 1, z: 2 }, distZ: 0, distX: 0, total: 0 };
    expect(lightningUvs(0, 0)).toEqual([0, 0, 0, 0, 1, 0]);
    expect(pointAlongLightning(corners, 0.4)).toEqual({ x: 1, z: 2 });
  });
});
