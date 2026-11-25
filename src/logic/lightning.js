/**
 * Corners of the L-shaped crawl used by the move trace.
 * The bolt leaves the origin square at the near corner in the direction of
 * travel, then enters the destination at the preceding edge.
 * A zero component still picks the negative corner, matching the original
 * `condition ? 0.5 : -0.5` choice.
 */
export function lightningCorners(start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const snap = {
    x: start.x + (dx > 0 ? 0.5 : -0.5),
    z: start.z + (dz > 0 ? 0.5 : -0.5),
  };
  const target = {
    x: end.x + (dx > 0 ? -0.5 : 0.5),
    z: end.z + (dz > 0 ? -0.5 : 0.5),
  };
  const distZ = Math.abs(snap.z - target.z);
  const distX = Math.abs(snap.x - target.x);
  return { snap, target, distZ, distX, total: distZ + distX };
}

/** UV pairs along the two-segment trace. The middle vertex splits the length. */
export function lightningUvs(distZ, total) {
  const mid = total === 0 ? 0 : distZ / total;
  return [0, 0, mid, 0, 1, 0];
}

/**
 * Point at the head of the bolt. `head` runs from 0 at the first corner
 * to 1 at the last. The first leg travels in Z, the second in X.
 */
export function pointAlongLightning(corners, head) {
  const { snap, target, distZ, total } = corners;
  if (!(total > 0)) return { x: snap.x, z: snap.z };

  const split = distZ / total;
  if (head <= split) {
    const t = split === 0 ? 1 : head / split;
    return {
      x: snap.x,
      z: snap.z + (target.z - snap.z) * t,
    };
  }

  const t = (head - split) / (1 - split);
  return {
    x: snap.x + (target.x - snap.x) * t,
    z: target.z,
  };
}
