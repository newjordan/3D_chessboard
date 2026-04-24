"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Board2DMoveFx {
  from: string;
  to: string;
  flags?: string;
  captured?: string;
}

interface Board2DProps {
  board: ({ type: string; color: string } | null)[][];
  lastMove?: { from: string; to: string } | null;
  whitePieceUrl?: string;
  blackPieceUrl?: string;
  fxMove?: Board2DMoveFx | null;
  fxKey?: number;
  fxSpeed?: number;
}

const FILE_IDS = 'abcdefgh';
const FILE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const RANK_LABELS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = { x: number; y: number; r: number; o: number };
const STARS: Star[] = (() => {
  const rng = mulberry32(1742);
  const arr: Star[] = [];
  for (let i = 0; i < 90; i++) {
    arr.push({
      x: rng() * 100,
      y: rng() * 100,
      r: 0.08 + rng() * 0.22,
      o: 0.18 + rng() * 0.62,
    });
  }
  return arr;
})();

const DARK_SQUARE_BG = '#02070d';
const LIGHT_SQUARE_BG = '#08263b';

function buildDotMatrixSvg(seed: number, fill: string, baseOpacity: number, jitter = 0.22) {
  const rng = mulberry32(seed);
  const circles: string[] = [];
  const spacing = 4;
  const half = spacing / 2;
  for (let y = half; y < 64; y += spacing) {
    for (let x = half; x < 64; x += spacing) {
      const jx = (rng() - 0.5) * jitter;
      const jy = (rng() - 0.5) * jitter;
      const rDot = 0.42 + rng() * 0.18;
      const op = baseOpacity + rng() * (1 - baseOpacity);
      circles.push(
        `<circle cx='${(x + jx).toFixed(2)}' cy='${(y + jy).toFixed(2)}' r='${rDot.toFixed(2)}' fill-opacity='${op.toFixed(2)}'/>`,
      );
    }
  }
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><g fill='${fill}'>${circles.join('')}</g></svg>")`;
}

const LIGHT_SQUARE_DOTMATRIX_SVG = buildDotMatrixSvg(771, '%238ceaff', 0.24);
const DARK_SQUARE_DOTMATRIX_SVG = buildDotMatrixSvg(1771, '%23236f88', 0.12, 0.12);

// Board-wide circuit graph. Generated once at module scope with a fixed seed so every render
// of the component shows the same PCB pattern. Coordinates live in square-space (0..8 × 0..8),
// where (c + fx, r + fy) is a point at fractional offset (fx, fy) inside square (r, c).
// Exported data (CIRCUIT_GRAPH.edges) will back the future move-trace animation — BFS a path
// from any source-square node to any dest-square node and stroke-dash-animate the green trail.
//
// Layout rules (see agents/tasks):
// - Interior nodes: 2–5 per square, positioned on a 5×5 sub-lattice at fractions {1,2,3,4,5}/6.
//   Connected in a chain via L-shaped (2-segment) orthogonal routes.
// - Highway nodes: 9×9 integer lattice (corners shared between neighboring squares).
// - Highway edges: unit segments along every horizontal and vertical grid line. These are the
//   "driveways" between distant squares.
// - Bridges: each square's interior chain attaches to at least 2 of its 4 corners so there's
//   always an entry/exit point.
// - Connectivity: verified by BFS at generation time; if the component count > 1, extra highway
//   edges are added until fully connected.
export type CircuitNode = { id: number; x: number; y: number; r: number; c: number; kind: 'interior' | 'highway' };
export type CircuitEdge = {
  id: number;
  path: string;
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  squares: Array<[number, number]>;
  kind: 'interior' | 'bridge' | 'highway';
  /** Ordered list of node ids along the edge (≥ 2). Used for pathfinding. */
  nodeIds: number[];
};
export type CircuitGraph = {
  nodes: CircuitNode[];
  edges: CircuitEdge[];
  squareNodeIds: number[][][];
  /** Adjacency list — neighbors per node id. Built during generation. */
  adjacency: number[][];
  /** Number of connected components in the final graph (expected to be 1). */
  componentCount: number;
};

function buildCircuitGraph(seed: number): CircuitGraph {
  const rng = mulberry32(seed);
  const nodes: CircuitNode[] = [];
  const edges: CircuitEdge[] = [];
  const squareNodeIds: number[][][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => [] as number[]),
  );
  const adjacency: number[][] = [];

  const quantize = (v: number) => Math.round(v * 64) / 64;
  const keyOf = (x: number, y: number) => `${Math.round(x * 64)}:${Math.round(y * 64)}`;
  const nodeAt = new Map<string, number>();

  const registerNode = (x: number, y: number, r: number, c: number, kind: 'interior' | 'highway'): CircuitNode => {
    const qx = quantize(x);
    const qy = quantize(y);
    const key = keyOf(qx, qy);
    const existing = nodeAt.get(key);
    if (existing != null) {
      const n = nodes[existing];
      if (!squareNodeIds[r][c].includes(n.id)) squareNodeIds[r][c].push(n.id);
      return n;
    }
    const node: CircuitNode = { id: nodes.length, x: qx, y: qy, r, c, kind };
    nodes.push(node);
    adjacency.push([]);
    squareNodeIds[r][c].push(node.id);
    nodeAt.set(key, node.id);
    return node;
  };

  const linkUndirected = (a: number, b: number) => {
    if (a === b) return;
    if (!adjacency[a].includes(b)) adjacency[a].push(b);
    if (!adjacency[b].includes(a)) adjacency[b].push(a);
  };

  // --- 1. Highway corner nodes: 9×9 integer lattice. Each corner is shared by up to 4 squares.
  for (let gy = 0; gy <= 8; gy++) {
    for (let gx = 0; gx <= 8; gx++) {
      // Assign corner to every adjacent square so squareNodeIds[r][c] can see it.
      for (const [dr, dc] of [[-1, -1], [-1, 0], [0, -1], [0, 0]] as const) {
        const rr = gy + dr;
        const cc = gx + dc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        registerNode(gx, gy, rr, cc, 'highway');
      }
    }
  }

  // --- 2. Highway edges: every unit segment along every grid line (horizontal + vertical).
  const straightEdge = (
    a: { x: number; y: number; id: number },
    b: { x: number; y: number; id: number },
    squares: Array<[number, number]>,
    kind: 'highway' | 'bridge' | 'interior',
  ) => {
    const path = `M${a.x} ${a.y} L${b.x} ${b.y}`;
    edges.push({ id: edges.length, path, p0: { x: a.x, y: a.y }, p1: { x: b.x, y: b.y }, squares, kind, nodeIds: [a.id, b.id] });
    linkUndirected(a.id, b.id);
  };

  // Horizontal highway edges along every rank line y = gy, from x=gx to x=gx+1.
  for (let gy = 0; gy <= 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const aId = nodeAt.get(keyOf(gx, gy))!;
      const bId = nodeAt.get(keyOf(gx + 1, gy))!;
      const squares: Array<[number, number]> = [];
      if (gy - 1 >= 0) squares.push([gy - 1, gx]);
      if (gy <= 7) squares.push([gy, gx]);
      straightEdge(
        { x: gx, y: gy, id: aId },
        { x: gx + 1, y: gy, id: bId },
        squares,
        'highway',
      );
    }
  }
  // Vertical highway edges along every file line x = gx, from y=gy to y=gy+1.
  for (let gx = 0; gx <= 8; gx++) {
    for (let gy = 0; gy < 8; gy++) {
      const aId = nodeAt.get(keyOf(gx, gy))!;
      const bId = nodeAt.get(keyOf(gx, gy + 1))!;
      const squares: Array<[number, number]> = [];
      if (gx - 1 >= 0) squares.push([gy, gx - 1]);
      if (gx <= 7) squares.push([gy, gx]);
      straightEdge(
        { x: gx, y: gy, id: aId },
        { x: gx, y: gy + 1, id: bId },
        squares,
        'highway',
      );
    }
  }

  // --- 3. Interior nodes on a 5×5 sub-lattice at fractions {1..5}/6 of the square.
  const LATTICE = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];

  const addInteriorEdge = (
    a: CircuitNode,
    b: CircuitNode,
    squares: Array<[number, number]>,
    horizFirst: boolean,
    kind: 'interior' | 'bridge',
  ) => {
    if (a.id === b.id) return;
    // L-shaped path, potentially split at the elbow as an intermediate waypoint node.
    const elbow = horizFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    if (
      (Math.abs(elbow.x - a.x) < 1e-6 && Math.abs(elbow.y - a.y) < 1e-6) ||
      (Math.abs(elbow.x - b.x) < 1e-6 && Math.abs(elbow.y - b.y) < 1e-6)
    ) {
      // Degenerate L (straight line).
      const path = `M${a.x} ${a.y} L${b.x} ${b.y}`;
      edges.push({ id: edges.length, path, p0: { x: a.x, y: a.y }, p1: { x: b.x, y: b.y }, squares, kind, nodeIds: [a.id, b.id] });
      linkUndirected(a.id, b.id);
      return;
    }
    // Register the elbow as an interior waypoint node (anchored to the first square).
    const anchor = squares[0];
    const elbowNode = registerNode(elbow.x, elbow.y, anchor[0], anchor[1], 'interior');
    const path = `M${a.x} ${a.y} L${elbow.x} ${elbow.y} L${b.x} ${b.y}`;
    edges.push({
      id: edges.length,
      path,
      p0: { x: a.x, y: a.y },
      p1: { x: b.x, y: b.y },
      squares,
      kind,
      nodeIds: [a.id, elbowNode.id, b.id],
    });
    linkUndirected(a.id, elbowNode.id);
    linkUndirected(elbowNode.id, b.id);
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      // Deterministic 2–5 interior nodes per square.
      const count = 2 + Math.floor(rng() * 4); // {2,3,4,5}
      // Pick `count` unique lattice slots from a shuffled 25-slot list.
      const slots: Array<[number, number]> = [];
      for (let iy = 0; iy < 5; iy++) for (let ix = 0; ix < 5; ix++) slots.push([ix, iy]);
      // Fisher-Yates with seeded RNG.
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = slots[i];
        slots[i] = slots[j];
        slots[j] = tmp;
      }
      const chosen = slots.slice(0, count);
      // Sort chosen slots so the chain visits them in a stable serpentine order (rows, snake).
      chosen.sort((a, b) => (a[1] - b[1]) || ((a[1] % 2 === 0 ? 1 : -1) * (a[0] - b[0])));

      const interiorIds: number[] = [];
      for (const [ix, iy] of chosen) {
        const n = registerNode(c + LATTICE[ix], r + LATTICE[iy], r, c, 'interior');
        interiorIds.push(n.id);
      }

      // Chain the interior nodes with L-shaped edges.
      for (let i = 0; i + 1 < interiorIds.length; i++) {
        const a = nodes[interiorIds[i]];
        const b = nodes[interiorIds[i + 1]];
        const horizFirst = ((r * 8 + c + i) % 2) === 0;
        addInteriorEdge(a, b, [[r, c]], horizFirst, 'interior');
      }

      // Bridge chain endpoints to 2 of the 4 corners of this square. Pick deterministically
      // to guarantee connectivity to the highway layer regardless of seed.
      const firstInterior = nodes[interiorIds[0]];
      const lastInterior = nodes[interiorIds[interiorIds.length - 1]];
      const corners: Array<{ x: number; y: number; id: number }> = [
        { x: c, y: r, id: nodeAt.get(keyOf(c, r))! },
        { x: c + 1, y: r, id: nodeAt.get(keyOf(c + 1, r))! },
        { x: c, y: r + 1, id: nodeAt.get(keyOf(c, r + 1))! },
        { x: c + 1, y: r + 1, id: nodeAt.get(keyOf(c + 1, r + 1))! },
      ];
      const nearestCorner = (p: CircuitNode, exclude: number) => {
        let best = corners[0];
        let bestD = Infinity;
        for (const cn of corners) {
          if (cn.id === exclude) continue;
          const d = Math.abs(cn.x - p.x) + Math.abs(cn.y - p.y);
          if (d < bestD) { bestD = d; best = cn; }
        }
        return best;
      };
      const cornerA = nearestCorner(firstInterior, -1);
      addInteriorEdge(
        firstInterior,
        nodes[cornerA.id],
        [[r, c]],
        ((r + c) % 2) === 0,
        'bridge',
      );
      // Second bridge only when chain has >=3 interior nodes (keeps total edge count down).
      if (interiorIds.length >= 3) {
        const cornerB = nearestCorner(lastInterior, cornerA.id);
        addInteriorEdge(
          lastInterior,
          nodes[cornerB.id],
          [[r, c]],
          ((r + c) % 2) === 1,
          'bridge',
        );
      }
    }
  }

  // --- 4. Connectivity verification via BFS; patch with highway edges if needed.
  const componentOf = new Int32Array(nodes.length).fill(-1);
  let componentCount = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (componentOf[i] !== -1) continue;
    componentCount++;
    const queue: number[] = [i];
    componentOf[i] = componentCount - 1;
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adjacency[cur]) {
        if (componentOf[nb] === -1) {
          componentOf[nb] = componentCount - 1;
          queue.push(nb);
        }
      }
    }
  }

  // In the canonical layout everything is already connected (highway grid + 2 bridges per
  // square). This block is a safety net: if someone changes counts/seeds later and produces
  // multiple components, fuse them via corner-to-corner highway links.
  if (componentCount > 1) {
    const componentsCorner = new Map<number, number>();
    for (let id = 0; id < nodes.length; id++) {
      if (nodes[id].kind !== 'highway') continue;
      const comp = componentOf[id];
      if (!componentsCorner.has(comp)) componentsCorner.set(comp, id);
    }
    const reps = [...componentsCorner.values()];
    for (let i = 1; i < reps.length; i++) {
      const a = nodes[reps[0]];
      const b = nodes[reps[i]];
      straightEdge(
        { x: a.x, y: a.y, id: a.id },
        { x: b.x, y: b.y, id: b.id },
        [],
        'highway',
      );
    }
    componentCount = 1;
  }

  return { nodes, edges, squareNodeIds, adjacency, componentCount };
}

const CIRCUIT_GRAPH: CircuitGraph = buildCircuitGraph(91173);

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  // Dev-only smoke test: log counts + a sample path so future changes are easy to eyeball.
  // eslint-disable-next-line no-console
  console.log('[Board2D/circuit] nodes=%d edges=%d components=%d', CIRCUIT_GRAPH.nodes.length, CIRCUIT_GRAPH.edges.length, CIRCUIT_GRAPH.componentCount);
}

function findNodePath(
  fromRC: [number, number],
  toRC: [number, number],
  graph: CircuitGraph = CIRCUIT_GRAPH,
): number[] | null {
  const [fr, fc] = fromRC;
  const [tr, tc] = toRC;
  if (fr < 0 || fr > 7 || fc < 0 || fc > 7 || tr < 0 || tr > 7 || tc < 0 || tc > 7) return null;
  const pickSquareAnchorNode = (r: number, c: number) => {
    const ids = graph.squareNodeIds[r][c];
    if (ids.length === 0) return -1;
    const centerX = c + 0.5;
    const centerY = r + 0.5;
    let best = ids[0];
    let bestScore = Infinity;
    for (const id of ids) {
      const node = graph.nodes[id];
      const centerDistance = Math.abs(node.x - centerX) + Math.abs(node.y - centerY);
      const boundaryPenalty =
        node.x <= c + 0.001 || node.x >= c + 0.999 || node.y <= r + 0.001 || node.y >= r + 0.999 ? 1.5 : 0;
      const kindPenalty = node.kind === 'interior' ? 0 : 4;
      const score = kindPenalty + boundaryPenalty + centerDistance;
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  };

  const start = pickSquareAnchorNode(fr, fc);
  const target = pickSquareAnchorNode(tr, tc);
  if (start < 0 || target < 0) return null;

  const prev = new Int32Array(graph.nodes.length).fill(-1);
  const visited = new Uint8Array(graph.nodes.length);
  const queue: number[] = [start];
  visited[start] = 1;
  let found = -1;
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === target) { found = cur; break; }
    for (const nb of graph.adjacency[cur]) {
      if (!visited[nb]) {
        visited[nb] = 1;
        prev[nb] = cur;
        queue.push(nb);
      }
    }
  }
  if (found < 0) return null;

  const chain: number[] = [];
  for (let id = found; id !== -1; id = prev[id] === id ? -1 : prev[id]) {
    chain.push(id);
    if (id === start) break;
  }
  chain.reverse();
  return chain;
}

type CircuitEntryPath = {
  d: string;
  width: number;
  opacity: number;
  delay: number;
  dur: number;
};

type CircuitEntryNode = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  delay: number;
  dur: number;
};

type CircuitTravelSegment = {
  d: string;
  width: number;
  opacity: number;
  delay: number;
  dur: number;
  kind: 'interior' | 'bridge' | 'highway';
};

type CircuitTravelNode = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  delay: number;
  dur: number;
  kind: 'interior' | 'highway';
};

type MoveFxPalette = {
  radialInner: string;
  radialOuter: string;
  entryStroke: string;
  entryNode: string;
  travelHalo: string;
  travelCore: string;
  nodeHalo: string;
  nodeCore: string;
  holdHalo: string;
  holdCore: string;
  pingCore: string;
  shellGlowNear: string;
  shellGlowFar: string;
  pieceGlowNear: string;
  pieceGlowFar: string;
  outlineFilter: string;
  ghostFilter: string;
  groupShadowNear: string;
  groupShadowFar: string;
};

type FinalSquarePing = {
  x: number;
  y: number;
  r: number;
  delay: number;
  dur: number;
};

type SquareReticle = {
  x: number;
  y: number;
  ringR: number;
  frameInset: number;
  delay: number;
  dur: number;
};

type MovingPieceFx = {
  key: number;
  from: [number, number];
  to: [number, number];
  toSquare: string;
  piece: { type: string; color: string };
  startDelayMs: number;
  durationMs: number;
};

const MOVE_SOURCE_DOUBLE_FLASH_MS = 420;
const MOVE_DEST_DOUBLE_FLASH_MS = 420;
const MOVE_PRELUDE_MS = MOVE_SOURCE_DOUBLE_FLASH_MS + MOVE_DEST_DOUBLE_FLASH_MS;
const LOCAL_CIRCUIT_TRACE_MS = 920;
const LOCAL_CIRCUIT_TRACE_COLORS = {
  w: { core: '#92fff0', halo: '#19e6d2' },
  b: { core: '#d8b6ff', halo: '#6a1dff' },
} as const;

function getLocalCircuitTraceColors(color: string) {
  return color === 'b' ? LOCAL_CIRCUIT_TRACE_COLORS.b : LOCAL_CIRCUIT_TRACE_COLORS.w;
}

function getMoveTraceSquares(from: [number, number], to: [number, number]) {
  const dr = Math.sign(to[0] - from[0]);
  const dc = Math.sign(to[1] - from[1]);
  const rowDistance = Math.abs(to[0] - from[0]);
  const colDistance = Math.abs(to[1] - from[1]);
  const isLineMove = from[0] === to[0] || from[1] === to[1] || rowDistance === colDistance;

  if (!isLineMove) return [`${from[0]}:${from[1]}`, `${to[0]}:${to[1]}`];

  const steps = Math.max(rowDistance, colDistance);
  return Array.from({ length: steps + 1 }, (_, idx) => `${from[0] + dr * idx}:${from[1] + dc * idx}`);
}

const GREEN_MOVE_FX_PALETTE: MoveFxPalette = {
  radialInner: '#d8ffb0',
  radialOuter: '#7dff00',
  entryStroke: '#9dff54',
  entryNode: '#d6ff98',
  travelHalo: '#7dff00',
  travelCore: '#dcffb7',
  nodeHalo: '#7dff00',
  nodeCore: '#d8ff96',
  holdHalo: '#7dff00',
  holdCore: '#baff63',
  pingCore: '#e7ffbe',
  shellGlowNear: 'rgba(186,255,116,0.92)',
  shellGlowFar: 'rgba(125,255,0,0.56)',
  pieceGlowNear: 'rgba(186,255,116,0.88)',
  pieceGlowFar: 'rgba(125,255,0,0.38)',
  outlineFilter: 'drop-shadow(0 0 4px rgba(186,255,116,0.32)) drop-shadow(0 0 10px rgba(125,255,0,0.24))',
  ghostFilter:
    'brightness(0) saturate(100%) invert(83%) sepia(98%) saturate(1274%) hue-rotate(29deg) brightness(103%) contrast(103%) blur(0.6px)',
  groupShadowNear: 'rgba(198, 255, 122, 0.95)',
  groupShadowFar: 'rgba(125, 255, 0, 0.7)',
};

function getMoveFxPalette(color: string): MoveFxPalette {
  return GREEN_MOVE_FX_PALETTE;
}

function getPieceGlowVars(palette: MoveFxPalette): React.CSSProperties {
  return {
    '--piece-glow-near': palette.pieceGlowNear,
    '--piece-glow-far': palette.pieceGlowFar,
  } as React.CSSProperties & Record<'--piece-glow-near' | '--piece-glow-far', string>;
}

function getMovePreludeVars(palette: MoveFxPalette): React.CSSProperties {
  return {
    '--move-prelude-core': palette.pingCore,
    '--move-prelude-halo': palette.travelHalo,
  } as React.CSSProperties & Record<'--move-prelude-core' | '--move-prelude-halo', string>;
}

function buildCircuitPulseFx(
  nodePath: number[],
  fromRC: [number, number],
  toRC: [number, number],
  isCapture: boolean,
  moveColor: string,
  speed = 1,
  graph: CircuitGraph = CIRCUIT_GRAPH,
): {
  introPings: FinalSquarePing[];
  introReticle: SquareReticle;
  entryPaths: CircuitEntryPath[];
  entryNodes: CircuitEntryNode[];
  entryGlow: { x: number; y: number; r: number; delay: number; dur: number };
  routeGhost: { d: string; delay: number; dur: number };
  travelSegments: CircuitTravelSegment[];
  travelNodes: CircuitTravelNode[];
  heldSegments: CircuitTravelSegment[];
  heldNodes: CircuitTravelNode[];
  finalPing: FinalSquarePing;
  landingReticle: SquareReticle;
  palette: MoveFxPalette;
  moveStartDelayMs: number;
  moveDurationMs: number;
} {
  const palette = getMoveFxPalette(moveColor);
  const visualSpeed = speed <= 1 ? speed : 1 + (speed - 1) * 0.34;
  const scale = 1 / Math.max(visualSpeed, 0.25);
  const sourceId = nodePath[0];
  const sourceNode = graph.nodes[sourceId];
  const terminalId = nodePath[nodePath.length - 1];
  const terminalNode = graph.nodes[terminalId];
  const targetSquareCenter = { x: toRC[1] + 0.5, y: toRC[0] + 0.5 };
  const inSquare = (node: CircuitNode, [r, c]: [number, number]) =>
    node.x >= c && node.x <= c + 1 && node.y >= r && node.y <= r + 1;
  const sourceSquareKey = `${fromRC[0]}:${fromRC[1]}`;
  const targetSquareKey = `${toRC[0]}:${toRC[1]}`;
  const touchesSquare = (edge: CircuitEdge, squareKey: string) =>
    edge.squares.some(([r, c]) => `${r}:${c}` === squareKey);
  const findHopEdge = (aId: number, bId: number) =>
    graph.edges.find((edge) => {
      for (let i = 1; i < edge.nodeIds.length; i++) {
        const prevId = edge.nodeIds[i - 1];
        const curId = edge.nodeIds[i];
        if ((prevId === aId && curId === bId) || (prevId === bId && curId === aId)) return true;
      }
      return false;
    });
  const pathEdges = nodePath.slice(1).map((id, idx) => {
    const fromId = nodePath[idx];
    return { fromId, toId: id, edge: findHopEdge(fromId, id) };
  });

  const entryPaths = pathEdges
    .filter((entry): entry is { fromId: number; toId: number; edge: CircuitEdge } => {
      const edge = entry.edge;
      return edge != null && edge.kind !== 'highway' && touchesSquare(edge, sourceSquareKey);
    })
    .slice(0, 2)
    .map(({ edge }, idx) => ({
      d: edge.path,
      width: edge.kind === 'bridge' ? 0.044 : 0.036,
      opacity: edge.kind === 'bridge' ? 0.18 : 0.13,
      delay: Math.round((idx * 44) * scale),
      dur: Math.round(170 * scale),
    }));

  const entryNodes = nodePath
    .map((id) => graph.nodes[id])
    .filter((node) => node.kind === 'interior' && inSquare(node, fromRC))
    .slice(0, 2)
    .map((node, idx) => ({
      x: node.x,
      y: node.y,
      r: 0.024,
      opacity: 0.24,
      delay: Math.round((idx * 50) * scale),
      dur: Math.round(160 * scale),
    }));

  const introPingGapMs = Math.round(220 * scale);
  const introPingDurMs = Math.round(340 * scale);
  const introPings = [
    { x: targetSquareCenter.x, y: targetSquareCenter.y, r: isCapture ? 0.28 : 0.22, delay: 0, dur: introPingDurMs },
    { x: targetSquareCenter.x, y: targetSquareCenter.y, r: isCapture ? 0.22 : 0.17, delay: introPingGapMs, dur: introPingDurMs },
  ];
  const introReticle = {
    x: targetSquareCenter.x,
    y: targetSquareCenter.y,
    ringR: 0.36,
    frameInset: 0.12,
    delay: 0,
    dur: Math.round(720 * scale),
  };

  const routeDelayMs = Math.round((introPingGapMs * 2) + 180 * scale);
  const hopStrideMs = Math.round((isCapture ? 248 : 216) * scale);
  const hopDurMs = Math.round((isCapture ? 420 : 380) * scale);
  const routeGhost = {
    d: nodePath
      .map((id, idx) => {
        const node = graph.nodes[id];
        const cmd = idx === 0 ? 'M' : 'L';
        return `${cmd}${node.x.toFixed(4)} ${node.y.toFixed(4)}`;
      })
      .join(' '),
    delay: routeDelayMs,
    dur: Math.round((Math.max(1, nodePath.length - 1) * hopStrideMs) + 1120 * scale),
  };

  const travelSegments = nodePath.slice(1).map((id, idx) => {
    const fromId = nodePath[idx];
    const a = graph.nodes[fromId];
    const b = graph.nodes[id];
    const edge = pathEdges[idx]?.edge;
    const kind = edge?.kind ?? 'interior';
    return {
      d: `M${a.x.toFixed(4)} ${a.y.toFixed(4)} L${b.x.toFixed(4)} ${b.y.toFixed(4)}`,
      width: kind === 'highway' ? 0.04 : kind === 'bridge' ? 0.058 : 0.05,
      opacity: kind === 'highway' ? 0.14 : kind === 'bridge' ? 0.32 : 0.28,
      delay: routeDelayMs + idx * hopStrideMs,
      dur: hopDurMs + (kind === 'bridge' ? Math.round(36 * scale) : 0),
      kind,
    };
  });

  const travelNodes = nodePath.map((id, idx) => {
    const node = graph.nodes[id];
    const inTargetSquare = inSquare(node, toRC);
    return {
      x: node.x,
      y: node.y,
      r: node.kind === 'highway' ? 0.02 : inTargetSquare ? 0.04 : 0.032,
      opacity: node.kind === 'highway' ? 0.12 : 0.48,
      delay: routeDelayMs + Math.max(0, idx * hopStrideMs - Math.round(32 * scale)),
      dur: Math.round((inTargetSquare ? 420 : 220) * scale),
      kind: node.kind,
    };
  }).filter((node, idx) => {
    const terminalLike = idx === nodePath.length - 1;
    return terminalLike || (node.kind === 'interior' && inSquare(graph.nodes[nodePath[idx]], toRC));
  });

  const trailDurationMs = Math.max(1, Math.max(0, nodePath.length - 1) * hopStrideMs + hopDurMs);
  const moveStartDelayMs = routeDelayMs + Math.round(trailDurationMs * 0.72);
  const moveDurationMs = Math.max(860, Math.round((trailDurationMs * 0.78) + 360 * scale));
  const holdDelayMs = routeDelayMs + trailDurationMs + Math.round(220 * scale);
  const targetTailEdges = pathEdges
    .map(({ edge }) => edge)
    .filter((edge): edge is CircuitEdge => edge != null && edge.kind !== 'highway' && touchesSquare(edge, targetSquareKey))
    .slice(-2);
  const heldSegments = targetTailEdges
    .map((edge) => ({
      d: edge.path,
      width: edge.kind === 'bridge' ? 0.056 : 0.048,
      opacity: edge.kind === 'bridge' ? 0.5 : 0.4,
      delay: holdDelayMs,
      dur: Math.round(3200 * scale),
      kind: edge.kind,
    }));

  const heldNodeIds = [...new Set(
    nodePath.filter((id) => {
      const node = graph.nodes[id];
      return node.kind === 'interior' && inSquare(node, toRC);
    }).slice(-2),
  )];
  const heldNodes = (heldNodeIds.length ? heldNodeIds : [terminalId]).map((id, idx) => {
    const node = graph.nodes[id];
    return {
      x: node.x,
      y: node.y,
      r: id === terminalId ? 0.05 : 0.04,
      opacity: id === terminalId ? 0.82 : 0.44,
      delay: holdDelayMs + Math.round(idx * 22 * scale),
      dur: Math.round(3000 * scale),
      kind: node.kind,
    };
  });

  const finalPing = {
    x: terminalNode.x,
    y: terminalNode.y,
    r: isCapture ? 0.2 : 0.16,
    delay: holdDelayMs + Math.round(220 * scale),
    dur: Math.round((isCapture ? 920 : 780) * scale),
  };
  const landingReticle = {
    x: targetSquareCenter.x,
    y: targetSquareCenter.y,
    ringR: 0.31,
    frameInset: 0.18,
    delay: holdDelayMs + Math.round(80 * scale),
    dur: Math.round(1460 * scale),
  };

  return {
    introPings,
    introReticle,
    entryPaths,
    entryNodes,
    entryGlow: {
      x: sourceNode.x,
      y: sourceNode.y,
      r: isCapture ? 0.44 : 0.3,
      delay: 0,
      dur: Math.round(90 * scale),
    },
    routeGhost,
    travelSegments,
    travelNodes,
    heldSegments,
    heldNodes,
    finalPing,
    landingReticle,
    palette,
    moveStartDelayMs,
    moveDurationMs,
  };
}

/**
 * BFS the circuit graph for an orthogonal polyline from some node in the source square to
 * some node in the destination square. Returns null if unreachable (shouldn't happen — the
 * graph is verified as one connected component at build time). The returned polyline is the
 * sequence of {x, y} waypoints suitable for feeding into an SVG path or a pulse animation.
 */
export function findPath(
  fromRC: [number, number],
  toRC: [number, number],
  graph: CircuitGraph = CIRCUIT_GRAPH,
): { x: number; y: number }[] | null {
  const chain = findNodePath(fromRC, toRC, graph);
  if (!chain) return null;
  return chain.map((id) => ({ x: graph.nodes[id].x, y: graph.nodes[id].y }));
}

const pieceNameMap: Record<string, string> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
};

const finalPieceIdMap: Record<string, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
};

const pieceScaleMap: Record<string, number> = {
  king: 0.94,
  queen: 0.92,
  rook: 0.9,
  bishop: 0.9,
  knight: 0.92,
  pawn: 0.84,
};

const PieceImage = ({ color, type }: { color: string; type: string; squareId: string }) => {
  const name = pieceNameMap[type.toLowerCase()];
  const assetId = finalPieceIdMap[name];
  const isWhite = color === 'w';

  if (name && assetId) {
    const pieceScale = pieceScaleMap[name] ?? 0.9;
    const finalPieceSrc = `/replay/final_12_mixed/${isWhite ? 'w' : 'b'}${assetId}.svg`;
    const pieceStyle = {
      transform: `scale(${pieceScale})`,
      transformOrigin: '50% 100%',
      '--piece-mask-image': `url("${finalPieceSrc}")`,
    } as React.CSSProperties & Record<'--piece-mask-image', string>;

    return (
      <div
        className={`relative w-full h-full select-none pointer-events-none chess-piece chess-piece-final chess-piece-${color}`}
        style={pieceStyle}
        aria-label={`${color} ${name}`}
        role="img"
      >
        <img
          src={finalPieceSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain chess-piece-final-aura"
          draggable={false}
        />
        <img
          src={finalPieceSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain chess-piece-final-rim"
          draggable={false}
        />
        <img
          src={finalPieceSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain chess-piece-final-img"
          draggable={false}
        />
        <img
          src={finalPieceSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain chess-piece-final-chroma chess-piece-final-chroma-a"
          draggable={false}
        />
        <img
          src={finalPieceSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain chess-piece-final-chroma chess-piece-final-chroma-b"
          draggable={false}
        />
        <div className="absolute inset-0 chess-piece-final-tint" aria-hidden="true" />
        <div className="absolute inset-0 chess-piece-final-specular" aria-hidden="true" />
        <div className="absolute inset-0 chess-piece-final-scan" aria-hidden="true" />
      </div>
    );
  }

  const fallbackSrc = `/${name}-${color}.svg`;
  return (
    <img
      src={fallbackSrc}
      alt={`${color} ${name}`}
      className="w-[84%] h-[84%] object-contain select-none pointer-events-none drop-shadow-[0_0_10px_rgba(125,210,255,0.2)]"
    />
  );
};

const squareToRC = (sq: string): [number, number] | null => {
  if (!sq || sq.length < 2) return null;
  const c = FILE_IDS.indexOf(sq[0].toLowerCase());
  const r = 8 - parseInt(sq[1], 10);
  if (c < 0 || r < 0 || r > 7) return null;
  return [r, c];
};

export const Board2D: React.FC<Board2DProps> = (props) => {
  const { board, lastMove, fxMove, fxKey, fxSpeed = 1 } = props;
  const [pulse, setPulse] = useState<{
    key: number;
    introPings: FinalSquarePing[];
    introReticle: SquareReticle;
    entryPaths: CircuitEntryPath[];
    entryNodes: CircuitEntryNode[];
    entryGlow: { x: number; y: number; r: number; delay: number; dur: number };
    routeGhost: { d: string; delay: number; dur: number };
    travelSegments: CircuitTravelSegment[];
    travelNodes: CircuitTravelNode[];
    heldSegments: CircuitTravelSegment[];
    heldNodes: CircuitTravelNode[];
    finalPing: FinalSquarePing;
    landingReticle: SquareReticle;
    palette: MoveFxPalette;
    moveStartDelayMs: number;
    moveDurationMs: number;
  } | null>(null);
  const [movingPieceFx, setMovingPieceFx] = useState<MovingPieceFx | null>(null);
  const pulseGlowId = pulse ? `circuit-pulse-glow-${String(pulse.key).replace(/[^a-zA-Z0-9_-]/g, '-')}` : null;

  useEffect(() => {
    if (!fxMove || !fxMove.from || !fxMove.to) return;
    const from = squareToRC(fxMove.from);
    const to = squareToRC(fxMove.to);
    if (!from || !to) return;
    setPulse(null);
  }, [fxMove]);

  useEffect(() => {
    if (!fxMove || !fxMove.from || !fxMove.to) return;
    const from = squareToRC(fxMove.from);
    const to = squareToRC(fxMove.to);
    if (!from || !to) return;
    const pieceAtDestination = board[to[0]]?.[to[1]];
    if (!pieceAtDestination) return;

    const nodePath = findNodePath(from, to);
    if (!nodePath || nodePath.length < 2) return;
    const moveFx = buildCircuitPulseFx(nodePath, from, to, Boolean(fxMove.captured), pieceAtDestination.color, fxSpeed * 0.8);
    const key = (fxKey ?? 0) + Math.random();
    
    const durationMs = Math.max(420, Math.min(680, moveFx.moveDurationMs * 0.38));
    const startDelayMs = 0;

    const startTimer = window.setTimeout(() => {
      setMovingPieceFx({
        key,
        from,
        to,
        toSquare: fxMove.to,
        piece: {
          type: pieceAtDestination.type,
          color: pieceAtDestination.color,
        },
        startDelayMs,
        durationMs,
      });
    }, MOVE_PRELUDE_MS);

    const clearTimer = window.setTimeout(() => {
      setMovingPieceFx((current) => (current?.key === key ? null : current));
    }, MOVE_PRELUDE_MS + startDelayMs + durationMs);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(clearTimer);
    };
  }, [board, fxKey, fxMove, fxSpeed]);

  const movePreludeCue = lastMove
    ? (() => {
        const from = squareToRC(lastMove.from);
        const to = squareToRC(lastMove.to);
        if (!from || !to) return null;
        const color = board[to[0]]?.[to[1]]?.color ?? 'w';
        return {
          key: `${lastMove.from}-${lastMove.to}-${fxKey ?? 0}`,
          from,
          to,
          palette: getMoveFxPalette(color),
        };
      })()
    : null;

  const localCircuitTrace = lastMove
    ? (() => {
        const from = squareToRC(lastMove.from);
        const to = squareToRC(lastMove.to);
        if (!from || !to) return null;
        const color = board[to[0]]?.[to[1]]?.color ?? 'w';
        return {
          key: `${lastMove.from}-${lastMove.to}-${fxKey ?? 0}`,
          squares: new Set(getMoveTraceSquares(from, to)),
          colors: getLocalCircuitTraceColors(color),
        };
      })()
    : null;

  return (
    <div
      data-testid="board2d-root"
      className="relative w-full aspect-square overflow-hidden bg-black board2d-container"
    >
      {/* Background Space layer */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#b8d4ff" opacity={s.o} />
        ))}
      </svg>

      {/* Retro-tech UI Overlay (Decorative Corners & Labels) */}
      <div className="absolute inset-0 pointer-events-none border border-[#2defff]/28 z-50">
        <div className="absolute top-2 left-2 w-9 h-9 border-t-2 border-l-2 border-[#50f6ff]/70 shadow-[0_0_18px_rgba(45,239,255,0.25)]" />
        <div className="absolute top-2 right-2 w-9 h-9 border-t-2 border-r-2 border-[#50f6ff]/70 shadow-[0_0_18px_rgba(45,239,255,0.25)]" />
        <div className="absolute bottom-2 left-2 w-9 h-9 border-b-2 border-l-2 border-[#50f6ff]/70 shadow-[0_0_18px_rgba(45,239,255,0.25)]" />
        <div className="absolute bottom-2 right-2 w-9 h-9 border-b-2 border-r-2 border-[#50f6ff]/70 shadow-[0_0_18px_rgba(45,239,255,0.25)]" />
      </div>

      <div className="absolute top-0 left-[7.4%] right-[7.4%] h-[7.4%] grid grid-cols-8 pointer-events-none" aria-hidden="true">
        {FILE_LABELS.map((f) => (
          <span key={`t-${f}`} className="flex items-center justify-center board2d-coordinate">{f}</span>
        ))}
      </div>
      <div className="absolute bottom-0 left-[7.4%] right-[7.4%] h-[7.4%] grid grid-cols-8 pointer-events-none" aria-hidden="true">
        {FILE_LABELS.map((f) => (
          <span key={`b-${f}`} className="flex items-center justify-center board2d-coordinate">{f}</span>
        ))}
      </div>
      <div className="absolute top-[7.4%] bottom-[7.4%] left-0 w-[7.4%] grid grid-rows-8 pointer-events-none" aria-hidden="true">
        {RANK_LABELS.map((r) => (
          <span key={`l-${r}`} className="flex items-center justify-center board2d-coordinate">{r}</span>
        ))}
      </div>
      <div className="absolute top-[7.4%] bottom-[7.4%] right-0 w-[7.4%] grid grid-rows-8 pointer-events-none" aria-hidden="true">
        {RANK_LABELS.map((r) => (
          <span key={`r-${r}`} className="flex items-center justify-center board2d-coordinate">{r}</span>
        ))}
      </div>

      <div className="absolute inset-[7.4%] grid grid-cols-8 grid-rows-8 border border-[#54f6ff]/65 shadow-[0_0_34px_rgba(45,239,255,0.22),inset_0_0_28px_rgba(56,255,214,0.11)] board2d-main-grid">
        {board.map((row, r) =>
          row.map((square, c) => {
            const squareId = `${FILE_IDS[c]}${8 - r}`;
            const isHighlighted = Boolean(lastMove && lastMove.to === squareId && movingPieceFx == null);
            const hideForLiftedMove = movingPieceFx?.toSquare === squareId;
            const showLocalCircuitTrace = Boolean(localCircuitTrace?.squares.has(`${r}:${c}`));
            const localCircuitEdges =
              showLocalCircuitTrace
                ? CIRCUIT_GRAPH.edges
                    .filter((edge) => edge.kind === 'interior' && edge.squares.some(([er, ec]) => er === r && ec === c))
                : [];
            const localCircuitNodes =
              showLocalCircuitTrace
                ? CIRCUIT_GRAPH.nodes
                    .filter((node) => node.kind === 'interior' && node.x >= c && node.x <= c + 1 && node.y >= r && node.y <= r + 1)
                : [];

            const isLight = (r + c) % 2 === 0;
            return (
              <div
                key={`${r}-${c}`}
                data-square-id={squareId}
                className={`relative flex items-center justify-center board2d-square ${
                  isLight ? 'board2d-square-light' : 'board2d-square-dark'
                }`}
                style={{ backgroundColor: isLight ? LIGHT_SQUARE_BG : DARK_SQUARE_BG }}
              >
                <div
                  data-layer="dotmatrix"
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: isLight ? LIGHT_SQUARE_DOTMATRIX_SVG : DARK_SQUARE_DOTMATRIX_SVG,
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    mixBlendMode: 'screen',
                    opacity: isLight ? 0.46 : 0.24,
                  }}
                />
                <div className="absolute inset-0 pointer-events-none board2d-square-sheen" aria-hidden="true" />
                {showLocalCircuitTrace && localCircuitTrace && (
                  <svg
                    key={`local-circuit-${localCircuitTrace.key}-${squareId}`}
                    className="absolute inset-0 w-full h-full pointer-events-none local-circuit-trace"
                    viewBox={`${c} ${r} 1 1`}
                    preserveAspectRatio="none"
                    style={{
                      '--local-circuit-core': localCircuitTrace.colors.core,
                      '--local-circuit-halo': localCircuitTrace.colors.halo,
                      animationDelay: `${MOVE_PRELUDE_MS}ms`,
                      animationDuration: `${LOCAL_CIRCUIT_TRACE_MS}ms`,
                    } as React.CSSProperties & Record<'--local-circuit-core' | '--local-circuit-halo', string>}
                    aria-hidden="true"
                  >
                    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                      {localCircuitEdges.map((edge) => (
                        <React.Fragment key={edge.id}>
                          <path
                            d={edge.path}
                            stroke="var(--local-circuit-halo)"
                            strokeWidth={0.082}
                            strokeOpacity={0.5}
                            className="local-circuit-trace-path local-circuit-trace-halo"
                          />
                          <path
                            d={edge.path}
                            stroke="var(--local-circuit-core)"
                            strokeWidth={0.034}
                            strokeOpacity={0.92}
                            className="local-circuit-trace-path"
                          />
                        </React.Fragment>
                      ))}
                    </g>
                    <g>
                      {localCircuitNodes.map((node) => (
                        <React.Fragment key={node.id}>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r="0.06"
                            fill="var(--local-circuit-halo)"
                            fillOpacity="0.28"
                            className="local-circuit-trace-node"
                          />
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r="0.028"
                            fill="var(--local-circuit-core)"
                            fillOpacity="0.95"
                            className="local-circuit-trace-node"
                          />
                        </React.Fragment>
                      ))}
                    </g>
                  </svg>
                )}
                {isHighlighted && (
                  <>
                    <div className="absolute inset-[7%] border border-[#d8fff2]/85 shadow-[0_0_14px_rgba(99,255,216,0.52)]" />
                    <div className="absolute inset-0 bg-[#4dffc8]/13" />
                  </>
                )}

                <AnimatePresence mode="popLayout">
                  {square && !hideForLiftedMove && (
                    <motion.div
                      key={`${square.type}-${square.color}-${squareId}`}
                      initial={lastMove?.to === squareId ? false : { scale: 0.78, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.78, opacity: 0 }}
                      transition={
                        lastMove?.to === squareId
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 260, damping: 26 }
                      }
                      className="w-full h-full flex items-center justify-center z-10"
                    >
                      {lastMove?.to === squareId ? (
                        <div
                          key={`mover-${fxKey ?? 0}`}
                          className="piece-move-glow w-full h-full flex items-center justify-center"
                          style={getPieceGlowVars(getMoveFxPalette(square.color))}
                        >
                          <PieceImage color={square.color} type={square.type} squareId={squareId} />
                        </div>
                      ) : (
                        <PieceImage color={square.color} type={square.type} squareId={squareId} />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}

        <svg
          data-layer="circuit-graph"
          className="absolute inset-0 w-full h-full pointer-events-none z-[4] board2d-circuit-graph"
          viewBox="0 0 8 8"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g fill="none" stroke="#65d9ff" strokeWidth="0.02" className="circuit-graph-highway">
            {CIRCUIT_GRAPH.edges.map((e) => (
              <path
                key={e.id}
                d={e.path}
                className={e.kind === 'highway' ? 'circuit-edge-highway' : e.kind === 'bridge' ? 'circuit-edge-bridge' : 'circuit-edge-interior'}
              />
            ))}
          </g>
          <g fill="#9be4ff" className="circuit-graph-nodes">
            {CIRCUIT_GRAPH.nodes.map((n) => (
              <circle key={n.id} cx={n.x} cy={n.y} r={n.kind === 'highway' ? '0.015' : '0.011'} className={n.kind === 'highway' ? 'circuit-node-highway' : 'circuit-node-interior'} />
            ))}
          </g>
        </svg>

        <svg
          data-layer="circuit-pulse"
          className="absolute inset-0 w-full h-full pointer-events-none z-40"
          viewBox="0 0 8 8"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {pulse && (
            <g
              key={pulse.key}
              className="circuit-pulse-group"
              style={{
                filter: `drop-shadow(0 0 0.05px ${pulse.palette.groupShadowNear}) drop-shadow(0 0 0.22px ${pulse.palette.groupShadowFar})`,
              }}
            >
              {pulseGlowId && (
                <defs>
                  <radialGradient id={pulseGlowId} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={pulse.palette.radialInner} stopOpacity="0.68" />
                    <stop offset="36%" stopColor={pulse.palette.radialOuter} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={pulse.palette.radialOuter} stopOpacity="0" />
                  </radialGradient>
                </defs>
              )}
              {pulseGlowId && (
                <circle
                  cx={pulse.entryGlow.x}
                  cy={pulse.entryGlow.y}
                  r={pulse.entryGlow.r}
                  fill={`url(#${pulseGlowId})`}
                  className="circuit-entry-radial"
                  style={{
                    animationDelay: `${pulse.entryGlow.delay}ms`,
                    animationDuration: `${pulse.entryGlow.dur}ms`,
                  }}
                />
              )}
              <g
                className="circuit-square-reticle"
                style={{
                  animationDelay: `${pulse.introReticle.delay}ms`,
                  animationDuration: `${pulse.introReticle.dur}ms`,
                }}
              >
                <circle
                  cx={pulse.introReticle.x}
                  cy={pulse.introReticle.y}
                  r={pulse.introReticle.ringR}
                  fill="none"
                  stroke={pulse.palette.travelCore}
                  strokeWidth="0.032"
                  strokeOpacity="0.76"
                />
                <rect
                  x={pulse.introReticle.x - (0.5 - pulse.introReticle.frameInset)}
                  y={pulse.introReticle.y - (0.5 - pulse.introReticle.frameInset)}
                  width={(0.5 - pulse.introReticle.frameInset) * 2}
                  height={(0.5 - pulse.introReticle.frameInset) * 2}
                  fill="none"
                  stroke={pulse.palette.pingCore}
                  strokeWidth="0.024"
                  strokeOpacity="0.62"
                />
              </g>
              {pulse.introPings.map((ping, i) => (
                <g key={`intro-ping-${i}`}>
                  {pulseGlowId && (
                    <circle
                      cx={ping.x}
                      cy={ping.y}
                      r={ping.r}
                      fill={`url(#${pulseGlowId})`}
                      className="circuit-final-ping-radial"
                      style={{
                        animationDelay: `${ping.delay}ms`,
                        animationDuration: `${ping.dur}ms`,
                      }}
                    />
                  )}
                  <circle
                    cx={ping.x}
                    cy={ping.y}
                    r="0.06"
                    fill={pulse.palette.pingCore}
                    className="circuit-final-ping-core"
                    style={{
                      animationDelay: `${ping.delay}ms`,
                      animationDuration: `${ping.dur}ms`,
                    }}
                  />
                </g>
              ))}
              <path
                d={pulse.routeGhost.d}
                fill="none"
                stroke={pulse.palette.travelHalo}
                strokeWidth="0.034"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.22"
                className="circuit-route-ghost"
                style={{
                  animationDelay: `${pulse.routeGhost.delay}ms`,
                  animationDuration: `${pulse.routeGhost.dur}ms`,
                }}
              />
              {pulse.entryPaths.map((entryPath, i) => (
                <path
                  key={`entry-path-${i}`}
                  d={entryPath.d}
                  fill="none"
                  stroke={pulse.palette.entryStroke}
                  strokeWidth={entryPath.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={entryPath.opacity}
                  className="circuit-entry-path"
                  style={{
                    animationDelay: `${entryPath.delay}ms`,
                    animationDuration: `${entryPath.dur}ms`,
                  }}
                />
              ))}
              {pulse.entryNodes.map((entryNode, i) => (
                <circle
                  key={`entry-node-${i}`}
                  cx={entryNode.x}
                  cy={entryNode.y}
                  r={entryNode.r}
                  fill={pulse.palette.entryNode}
                  fillOpacity={entryNode.opacity}
                  className="circuit-entry-node"
                  style={{
                    animationDelay: `${entryNode.delay}ms`,
                    animationDuration: `${entryNode.dur}ms`,
                  }}
                />
              ))}
              {pulse.travelSegments.map((segment, i) => (
                <g key={`travel-segment-${i}`}>
                  <path
                    d={segment.d}
                    pathLength="100"
                    fill="none"
                    stroke={pulse.palette.travelHalo}
                    strokeWidth={segment.width * 1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity={Math.min(0.22, segment.opacity * 0.45)}
                    className="circuit-travel-halo"
                    style={{
                      animationDelay: `${segment.delay}ms`,
                      animationDuration: `${segment.dur}ms`,
                    }}
                  />
                  <path
                    d={segment.d}
                    pathLength="100"
                    fill="none"
                    stroke={pulse.palette.travelCore}
                    strokeWidth={segment.width * 0.54}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity="0.78"
                    className="circuit-travel-energy"
                    style={{
                      animationDelay: `${segment.delay}ms`,
                      animationDuration: `${segment.dur}ms`,
                    }}
                  />
                </g>
              ))}
              {pulse.travelNodes.map((travelNode, i) => (
                <g key={`travel-node-${i}`}>
                  <circle
                    cx={travelNode.x}
                    cy={travelNode.y}
                    r={travelNode.r * 1.7}
                    fill={pulse.palette.nodeHalo}
                    fillOpacity={Math.min(0.18, travelNode.opacity * 0.22)}
                    className="circuit-travel-node"
                    style={{
                      animationDelay: `${travelNode.delay}ms`,
                      animationDuration: `${travelNode.dur}ms`,
                    }}
                  />
                  <circle
                    cx={travelNode.x}
                    cy={travelNode.y}
                    r={travelNode.r}
                    fill={pulse.palette.nodeCore}
                    fillOpacity={Math.min(0.72, travelNode.opacity)}
                    className="circuit-travel-node"
                    style={{
                      animationDelay: `${travelNode.delay}ms`,
                      animationDuration: `${travelNode.dur}ms`,
                    }}
                  />
                </g>
              ))}
              {pulse.heldSegments.map((segment, i) => (
                <g key={`held-segment-${i}`}>
                  <path
                    d={segment.d}
                    fill="none"
                    stroke={pulse.palette.holdHalo}
                    strokeWidth={segment.width * 1.65}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity={Math.min(0.24, segment.opacity * 0.36)}
                    className="circuit-held-segment"
                    style={{
                      animationDelay: `${segment.delay}ms`,
                      animationDuration: `${segment.dur}ms`,
                    }}
                  />
                  <path
                    d={segment.d}
                    fill="none"
                    stroke={pulse.palette.holdCore}
                    strokeWidth={segment.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity={Math.min(0.62, segment.opacity)}
                    className="circuit-held-segment"
                    style={{
                      animationDelay: `${segment.delay}ms`,
                      animationDuration: `${segment.dur}ms`,
                    }}
                  />
                </g>
              ))}
              {pulse.heldNodes.map((heldNode, i) => (
                <g key={`held-node-${i}`}>
                  <circle
                    cx={heldNode.x}
                    cy={heldNode.y}
                    r={heldNode.r * 1.9}
                    fill={pulse.palette.holdHalo}
                    fillOpacity={Math.min(0.18, heldNode.opacity * 0.22)}
                    className="circuit-held-node"
                    style={{
                      animationDelay: `${heldNode.delay}ms`,
                      animationDuration: `${heldNode.dur}ms`,
                    }}
                  />
                  <circle
                    cx={heldNode.x}
                    cy={heldNode.y}
                    r={heldNode.r}
                    fill={pulse.palette.nodeCore}
                    fillOpacity={Math.min(0.74, heldNode.opacity)}
                    className="circuit-held-node"
                    style={{
                      animationDelay: `${heldNode.delay}ms`,
                      animationDuration: `${heldNode.dur}ms`,
                    }}
                  />
                </g>
              ))}
              <g
                className="circuit-square-reticle circuit-square-reticle-landing"
                style={{
                  animationDelay: `${pulse.landingReticle.delay}ms`,
                  animationDuration: `${pulse.landingReticle.dur}ms`,
                }}
              >
                <circle
                  cx={pulse.landingReticle.x}
                  cy={pulse.landingReticle.y}
                  r={pulse.landingReticle.ringR}
                  fill="none"
                  stroke={pulse.palette.holdCore}
                  strokeWidth="0.028"
                  strokeOpacity="0.68"
                />
                <rect
                  x={pulse.landingReticle.x - (0.5 - pulse.landingReticle.frameInset)}
                  y={pulse.landingReticle.y - (0.5 - pulse.landingReticle.frameInset)}
                  width={(0.5 - pulse.landingReticle.frameInset) * 2}
                  height={(0.5 - pulse.landingReticle.frameInset) * 2}
                  fill="none"
                  stroke={pulse.palette.nodeCore}
                  strokeWidth="0.022"
                  strokeOpacity="0.56"
                />
              </g>
              {pulseGlowId && (
                <circle
                  cx={pulse.finalPing.x}
                  cy={pulse.finalPing.y}
                  r={pulse.finalPing.r}
                  fill={`url(#${pulseGlowId})`}
                  className="circuit-final-ping-radial"
                  style={{
                    animationDelay: `${pulse.finalPing.delay}ms`,
                    animationDuration: `${pulse.finalPing.dur}ms`,
                  }}
                />
              )}
              <circle
                cx={pulse.finalPing.x}
                cy={pulse.finalPing.y}
                r="0.065"
                fill={pulse.palette.pingCore}
                className="circuit-final-ping-core"
                style={{
                  animationDelay: `${pulse.finalPing.delay}ms`,
                  animationDuration: `${pulse.finalPing.dur}ms`,
                }}
              />
            </g>
          )}
        </svg>

        <AnimatePresence>
          {movePreludeCue && (
            <div
              key={`move-prelude-${movePreludeCue.key}`}
              className="absolute inset-0 pointer-events-none z-[24]"
              style={getMovePreludeVars(movePreludeCue.palette)}
              aria-hidden="true"
            >
              <div
                className="absolute move-prelude-square move-prelude-square-source"
                style={{
                  left: `${movePreludeCue.from[1] * 12.5}%`,
                  top: `${movePreludeCue.from[0] * 12.5}%`,
                  width: '12.5%',
                  height: '12.5%',
                }}
              />
              <div
                className="absolute move-prelude-square move-prelude-square-dest"
                style={{
                  left: `${movePreludeCue.to[1] * 12.5}%`,
                  top: `${movePreludeCue.to[0] * 12.5}%`,
                  width: '12.5%',
                  height: '12.5%',
                }}
              />
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {movingPieceFx && (
            <React.Fragment key={`moving-piece-wrapper-${movingPieceFx.key}`}>
              <div className="absolute inset-0 pointer-events-none z-30 overflow-visible">
                <motion.div
                  data-moving-piece="true"
                  data-moving-piece-to={movingPieceFx.toSquare}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${movingPieceFx.from[1] * 12.5}%`,
                    top: `${movingPieceFx.from[0] * 12.5}%`,
                    width: '12.5%',
                    height: '12.5%',
                    transformOrigin: '50% 50%',
                  }}
                  initial={{
                    x: '0%',
                    y: '0%',
                  }}
                  animate={{
                    x: `${(movingPieceFx.to[1] - movingPieceFx.from[1]) * 100}%`,
                    y: `${(movingPieceFx.to[0] - movingPieceFx.from[0]) * 100}%`,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    delay: movingPieceFx.startDelayMs / 1000,
                    duration: movingPieceFx.durationMs / 1000,
                    ease: [0.33, 0, 0.2, 1],
                    x: { ease: [0.33, 0, 0.2, 1] },
                    y: { ease: [0.33, 0, 0.2, 1] }
                  }}
                >
                  <motion.div
                    className="w-full h-full flex items-center justify-center lifted-piece-shell"
                    initial={{
                      scale: 1,
                      filter: 'drop-shadow(0 0 0px rgba(0,0,0,0))',
                    }}
                    animate={{
                      scale: [1, 1.35, 1],
                      filter: [
                        'drop-shadow(0 0 0px rgba(0,0,0,0))',
                        `drop-shadow(0 0 13px ${getMoveFxPalette(movingPieceFx.piece.color).shellGlowNear}) drop-shadow(0 0 28px ${getMoveFxPalette(movingPieceFx.piece.color).shellGlowFar})`,
                        `drop-shadow(0 0 4px ${getMoveFxPalette(movingPieceFx.piece.color).pieceGlowNear}) drop-shadow(0 0 8px ${getMoveFxPalette(movingPieceFx.piece.color).pieceGlowFar})`,
                      ],
                    }}
                    transition={{
                      delay: movingPieceFx.startDelayMs / 1000,
                      duration: movingPieceFx.durationMs / 1000,
                      scale: {
                        times: [0, 0.5, 1],
                        ease: [0.4, 0, 0.2, 1],
                      },
                      filter: {
                        times: [0, 0.5, 1],
                        ease: [0.4, 0, 0.2, 1],
                      },
                    }}
                  >
                    <motion.div
                      className="relative w-full h-full flex items-center justify-center lifted-piece-outline"
                      initial={{ filter: 'drop-shadow(0 0 0 rgba(0,0,0,0))' }}
                      animate={{
                        filter: [
                          'drop-shadow(0 0 0 rgba(0,0,0,0))',
                          getMoveFxPalette(movingPieceFx.piece.color).outlineFilter,
                          getMoveFxPalette(movingPieceFx.piece.color).outlineFilter,
                          'drop-shadow(0 0 0 rgba(0,0,0,0))',
                        ],
                      }}
                      transition={{
                        delay: movingPieceFx.startDelayMs / 1000,
                        duration: movingPieceFx.durationMs / 1000,
                        ease: "easeInOut",
                        times: [0, 0.2, 0.8, 1],
                      }}
                    >
                      <motion.div
                        className="absolute inset-0 opacity-65 mix-blend-screen lifted-piece-ghost"
                        style={{ filter: getMoveFxPalette(movingPieceFx.piece.color).ghostFilter }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.32, 0.24, 0] }}
                        transition={{
                          delay: movingPieceFx.startDelayMs / 1000,
                          duration: movingPieceFx.durationMs / 1000,
                          ease: "easeInOut",
                          times: [0, 0.3, 0.7, 1],
                        }}
                        aria-hidden="true"
                      >
                        <PieceImage
                          color={movingPieceFx.piece.color}
                          type={movingPieceFx.piece.type}
                          squareId={`${movingPieceFx.toSquare}-ghost`}
                        />
                      </motion.div>
                      <PieceImage
                        color={movingPieceFx.piece.color}
                        type={movingPieceFx.piece.type}
                        squareId={movingPieceFx.toSquare}
                      />
                    </motion.div>
                  </motion.div>
                </motion.div>
              </div>
            </React.Fragment>
          )}
        </AnimatePresence>
      </div>

      {/* Retro Glass / CRT Overlays */}
      <div className="absolute inset-0 pointer-events-none z-[60] mix-blend-overlay opacity-30 bg-[radial-gradient(circle_at_50%_50%,transparent_50%,rgba(0,0,0,0.8)_100%)]" />
      <div className="absolute inset-0 pointer-events-none z-[61] opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />
      <div className="absolute inset-0 pointer-events-none z-[62] opacity-10 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_0%,transparent_60%)]" />
      
      {/* Scanline Animation Overlay (Disabled for clarity, kept as empty div if needed for future layers) */}
      <div className="absolute inset-0 pointer-events-none z-[63]" />

      <style jsx global>{`
        .board2d-container {
          background:
            radial-gradient(circle at 50% 48%, rgba(38, 244, 255, 0.065), transparent 44%),
            linear-gradient(135deg, #020508 0%, #020b12 48%, #03110e 100%);
          border: 1px solid rgba(88, 246, 255, 0.28);
          box-shadow:
            0 0 0 1px rgba(61, 255, 216, 0.08),
            0 20px 70px rgba(0, 0, 0, 0.62),
            inset 0 0 42px rgba(34, 239, 255, 0.08);
          isolation: isolate;
        }
        .board2d-container::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(62, 255, 219, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(62, 255, 219, 0.05) 1px, transparent 1px);
          background-size: 4.15% 4.15%;
          mask-image: radial-gradient(circle at 50% 50%, black 0%, transparent 74%);
          opacity: 0.52;
          z-index: 1;
        }
        .board2d-coordinate {
          color: rgba(113, 239, 255, 0.66);
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: clamp(7px, 1.35vw, 10px);
          font-weight: 700;
          letter-spacing: 0;
          text-shadow: 0 0 8px rgba(62, 239, 255, 0.58);
        }
        .board2d-main-grid {
          background-image: 
            linear-gradient(rgba(73, 246, 255, 0.095) 1px, transparent 1px),
            linear-gradient(90deg, rgba(73, 246, 255, 0.095) 1px, transparent 1px);
          background-size: 12.5% 12.5%;
          backdrop-filter: blur(0.2px);
        }
        .board2d-main-grid::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(90deg, transparent 0 12.35%, rgba(126, 255, 226, 0.14) 12.45% 12.55%, transparent 12.65%),
            linear-gradient(0deg, transparent 0 12.35%, rgba(126, 255, 226, 0.12) 12.45% 12.55%, transparent 12.65%);
          background-size: 12.5% 12.5%;
          mix-blend-mode: screen;
          opacity: 0.34;
          z-index: 6;
        }
        .board2d-square {
          overflow: hidden;
        }
        .board2d-square::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.58;
          background:
            linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent 44%),
            radial-gradient(circle at 50% 50%, rgba(67, 251, 255, 0.06), transparent 62%);
        }
        .board2d-square-light {
          box-shadow: inset 0 0 20px rgba(55, 220, 255, 0.105);
        }
        .board2d-square-dark {
          box-shadow: inset 0 0 18px rgba(29, 255, 214, 0.045);
        }
        .board2d-square-sheen {
          background:
            linear-gradient(90deg, rgba(96, 255, 225, 0.08), transparent 26%, transparent 74%, rgba(63, 238, 255, 0.07)),
            linear-gradient(0deg, rgba(96, 255, 225, 0.055), transparent 24%, transparent 74%, rgba(63, 238, 255, 0.055));
          opacity: 0.42;
        }
        .board2d-circuit-graph {
          opacity: 0.2;
          mix-blend-mode: screen;
        }
        .circuit-edge-highway {
          stroke-opacity: 0.34;
        }
        .circuit-edge-bridge {
          stroke-opacity: 0.22;
        }
        .circuit-edge-interior {
          stroke-opacity: 0.16;
        }
        .circuit-node-highway {
          fill-opacity: 0.36;
        }
        .circuit-node-interior {
          fill-opacity: 0.2;
        }
        @keyframes circuitPulseTravel {
          0%   { stroke-dashoffset: 0; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { stroke-dashoffset: -100; opacity: 0; }
        }
        @keyframes circuitPulseRoute {
          0%   { opacity: 0; }
          8%   { opacity: 1; }
          70%  { opacity: 0.78; }
          100% { opacity: 0; }
        }
        @keyframes circuitRouteGhost {
          0%   { opacity: 0; }
          12%  { opacity: 0.7; }
          76%  { opacity: 0.54; }
          100% { opacity: 0; }
        }
        @keyframes circuitEntryConverge {
          0%   { opacity: 0; }
          20%  { opacity: 0.92; }
          100% { opacity: 0; }
        }
        @keyframes circuitReticlePulse {
          0%   { opacity: 0; transform: scale(0.84); }
          18%  { opacity: 1; transform: scale(1); }
          66%  { opacity: 0.68; transform: scale(1.08); }
          100% { opacity: 0; transform: scale(1.18); }
        }
        @keyframes circuitFinalPing {
          0%   { opacity: 0; transform: scale(0.28); }
          20%  { opacity: 0.56; transform: scale(0.94); }
          58%  { opacity: 0.28; transform: scale(1.02); }
          100% { opacity: 0; transform: scale(1.22); }
        }
        @keyframes circuitPulseSpark {
          0%   { opacity: 0; transform: scale(0.15); }
          30%  { opacity: 1; transform: scale(1.35); }
          60%  { opacity: 0.65; transform: scale(0.95); }
          100% { opacity: 0; transform: scale(0.3); }
        }
        @keyframes circuitNodeHold {
          0%   { opacity: 0; transform: scale(0.2); }
          18%  { opacity: 0.86; transform: scale(1.06); }
          72%  { opacity: 0.82; transform: scale(1); }
          100% { opacity: 0.18; transform: scale(0.98); }
        }
        /* Piece glow triggers whenever lastMove.to equals this square AND fxKey changed.
           The keyed wrapper remounts on each move, restarting the animation. */
        @keyframes pieceMoveGlow {
          0%   { filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
          12%  { filter: drop-shadow(0 0 6px var(--piece-glow-near))
                         drop-shadow(0 0 14px var(--piece-glow-far)); }
          60%  { filter: drop-shadow(0 0 5px var(--piece-glow-near))
                         drop-shadow(0 0 12px var(--piece-glow-far)); }
          100% { filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
        }
        .circuit-pulse-group {}
        .circuit-entry-radial {
          opacity: 0;
          mix-blend-mode: screen;
          animation-name: circuitEntryConverge;
          animation-timing-function: cubic-bezier(0.18, 0.68, 0.28, 1);
          animation-fill-mode: forwards;
        }
        .circuit-entry-path {
          opacity: 0;
          mix-blend-mode: screen;
          animation-name: circuitEntryConverge;
          animation-timing-function: cubic-bezier(0.18, 0.68, 0.28, 1);
          animation-fill-mode: forwards;
        }
        .circuit-entry-node {
          opacity: 0;
          mix-blend-mode: screen;
          animation-name: circuitEntryConverge;
          animation-timing-function: cubic-bezier(0.15, 0.85, 0.3, 1);
          animation-fill-mode: forwards;
        }
        .circuit-square-reticle {
          opacity: 0;
          mix-blend-mode: screen;
          transform-origin: center;
          transform-box: fill-box;
          animation-name: circuitReticlePulse;
          animation-timing-function: cubic-bezier(0.18, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .circuit-route-ghost {
          opacity: 0;
          mix-blend-mode: screen;
          animation-name: circuitRouteGhost;
          animation-timing-function: cubic-bezier(0.18, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .circuit-final-ping-radial {
          opacity: 0;
          mix-blend-mode: screen;
          transform-origin: center;
          transform-box: fill-box;
          animation-name: circuitFinalPing;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .circuit-travel-halo {
          stroke-dasharray: 22 200;
          stroke-dashoffset: 0;
          opacity: 0;
          mix-blend-mode: screen;
          animation-name: circuitPulseTravel;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .circuit-travel-energy {
          stroke-dasharray: 12 200;
          stroke-dashoffset: 0;
          opacity: 0;
          mix-blend-mode: screen;
          animation-name: circuitPulseTravel;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .circuit-travel-node {
          opacity: 0;
          mix-blend-mode: screen;
          transform-origin: center;
          transform-box: fill-box;
          animation-name: circuitPulseSpark;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .circuit-held-segment {
          opacity: 0;
          mix-blend-mode: screen;
          animation-name: circuitNodeHold;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .circuit-held-node {
          opacity: 0;
          mix-blend-mode: screen;
          transform-origin: center;
          transform-box: fill-box;
          animation-name: circuitNodeHold;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .circuit-final-ping-core {
          opacity: 0;
          transform-origin: center;
          transform-box: fill-box;
          animation-name: circuitFinalPing;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
        }
        .piece-move-glow {
          animation: pieceMoveGlow 760ms ease-out forwards;
          will-change: filter;
        }
        @keyframes localCircuitTracePulse {
          0% {
            opacity: 0;
            filter: brightness(1) saturate(1);
            transform: scale(0.985);
          }
          16% {
            opacity: 0.92;
            filter: brightness(1.34) saturate(1.18);
            transform: scale(1);
          }
          58% {
            opacity: 0.68;
            filter: brightness(1.16) saturate(1.08);
            transform: scale(1);
          }
          100% {
            opacity: 0;
            filter: brightness(1) saturate(1);
            transform: scale(1.015);
          }
        }
        .local-circuit-trace {
          opacity: 0;
          z-index: 8;
          mix-blend-mode: screen;
          transform-origin: center;
          animation-name: localCircuitTracePulse;
          animation-timing-function: cubic-bezier(0.2, 0.8, 0.24, 1);
          animation-fill-mode: forwards;
          filter: drop-shadow(0 0 0.28px var(--local-circuit-halo))
            drop-shadow(0 0 0.48px var(--local-circuit-core));
        }
        .local-circuit-trace-halo {
          filter: blur(0.012px);
        }
        @keyframes movePreludeDoubleFlash {
          0% {
            opacity: 0;
            transform: scale(0.9);
          }
          13% {
            opacity: 1;
            transform: scale(1);
          }
          28% {
            opacity: 0.2;
            transform: scale(1.025);
          }
          43% {
            opacity: 1;
            transform: scale(1);
          }
          66% {
            opacity: 0.3;
            transform: scale(1.04);
          }
          100% {
            opacity: 0;
            transform: scale(1.08);
          }
        }
        .move-prelude-square {
          opacity: 0;
          transform-origin: center;
          animation: movePreludeDoubleFlash ${MOVE_SOURCE_DOUBLE_FLASH_MS}ms cubic-bezier(0.18, 0.8, 0.24, 1) forwards;
        }
        .move-prelude-square::before,
        .move-prelude-square::after {
          content: "";
          position: absolute;
          inset: 8%;
          pointer-events: none;
        }
        .move-prelude-square::before {
          border: 2px solid var(--move-prelude-core);
          box-shadow:
            0 0 12px var(--move-prelude-core),
            0 0 28px var(--move-prelude-halo),
            inset 0 0 18px rgba(186, 255, 116, 0.18);
        }
        .move-prelude-square::after {
          background:
            radial-gradient(circle at 50% 50%, rgba(231, 255, 190, 0.3), rgba(125, 255, 0, 0.16) 38%, transparent 68%);
          mix-blend-mode: screen;
        }
        .move-prelude-square-dest {
          animation-delay: ${MOVE_SOURCE_DOUBLE_FLASH_MS}ms;
        }
        @keyframes directTracerGrow {
          0% {
            opacity: 0;
            transform: translateY(-50%) scaleX(0);
          }
          16% {
            opacity: 1;
            transform: translateY(-50%) scaleX(1);
          }
          70% {
            opacity: 0.72;
            transform: translateY(-50%) scaleX(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-50%) scaleX(1);
          }
        }
        .direct-move-tracer {
          mix-blend-mode: screen;
        }
        .direct-move-tracer-axis {
          height: 0;
          transform-origin: 0 50%;
        }
        .direct-move-tracer-beam {
          position: absolute;
          left: 0;
          top: 50%;
          width: 100%;
          height: 12px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(216, 255, 183, 0.04), var(--direct-tracer-core), var(--direct-tracer-halo));
          opacity: 0;
          transform-origin: 0 50%;
          transform: translateY(-50%);
          filter: blur(5px) drop-shadow(0 0 18px var(--direct-tracer-halo));
          animation: directTracerGrow 980ms cubic-bezier(0.16, 0.8, 0.24, 1) forwards;
        }
        .direct-move-tracer-core {
          position: absolute;
          left: 0;
          top: 50%;
          width: 100%;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(216, 255, 183, 0.08), var(--direct-tracer-core) 42%, var(--direct-tracer-ping));
          opacity: 0;
          transform-origin: 0 50%;
          transform: translateY(-50%);
          box-shadow:
            0 0 8px var(--direct-tracer-core),
            0 0 18px var(--direct-tracer-halo);
          animation: directTracerGrow 900ms cubic-bezier(0.16, 0.8, 0.24, 1) forwards;
        }
        .direct-move-tracer-head {
          width: 18px;
          height: 18px;
          margin-left: -9px;
          margin-top: -9px;
          border-radius: 999px;
          background:
            radial-gradient(circle, var(--direct-tracer-ping) 0 22%, var(--direct-tracer-core) 36%, rgba(125, 255, 0, 0.08) 72%, transparent 76%);
          box-shadow:
            0 0 12px var(--direct-tracer-core),
            0 0 26px var(--direct-tracer-halo);
          mix-blend-mode: screen;
        }
        .chess-piece {
          filter: none;
        }
        .chess-piece-final {
          filter: drop-shadow(0 2px 1px rgba(0, 0, 0, 0.7));
        }
        .chess-piece::before {
          content: "";
          position: absolute;
          inset: 9% 12% 6%;
          border-radius: 999px;
          background: radial-gradient(ellipse at 50% 63%, rgba(0, 7, 12, 0.76), rgba(0, 14, 18, 0.24) 48%, transparent 72%);
          filter: blur(1px);
          opacity: 0.82;
        }
        .chess-piece-final-img {
          padding: 5% 6% 8%;
          z-index: 3;
        }
        .chess-piece-w .chess-piece-final-img {
          filter:
            brightness(0.98)
            saturate(0.92)
            contrast(1.1);
        }
        .chess-piece-b .chess-piece-final-img {
          filter:
            hue-rotate(248deg)
            brightness(0.58)
            saturate(1.25)
            contrast(1.28);
        }
        .chess-piece-final-aura,
        .chess-piece-final-rim,
        .chess-piece-final-chroma {
          padding: 5% 6% 8%;
          pointer-events: none;
          user-select: none;
        }
        .chess-piece-final-aura {
          z-index: 1;
          display: none;
          opacity: 0;
          transform: scale(1);
          transform-origin: 50% 60%;
          mix-blend-mode: screen;
          filter: none;
        }
        .chess-piece-w .chess-piece-final-aura {
          filter: none;
        }
        .chess-piece-b .chess-piece-final-aura {
          opacity: 0;
          filter: none;
        }
        .chess-piece-final-rim {
          z-index: 2;
          opacity: 0.14;
          transform: translate(-0.5px, -0.5px) scale(1.004);
          transform-origin: 50% 60%;
          mix-blend-mode: screen;
        }
        .chess-piece-w .chess-piece-final-rim {
          filter:
            brightness(0)
            saturate(100%)
            invert(91%)
            sepia(30%)
            saturate(814%)
            hue-rotate(127deg)
            brightness(108%)
            contrast(102%);
        }
        .chess-piece-b .chess-piece-final-rim {
          opacity: 0.24;
          filter:
            brightness(0)
            saturate(100%)
            invert(18%)
            sepia(87%)
            saturate(1800%)
            hue-rotate(248deg)
            brightness(82%)
            contrast(108%);
        }
        .chess-piece-final-chroma {
          z-index: 7;
          opacity: 0.48;
          mix-blend-mode: screen;
          transform-origin: 50% 58%;
        }
        .chess-piece-final-chroma-a {
          transform: translate(-1.8px, 0.75px);
        }
        .chess-piece-final-chroma-b {
          transform: translate(1.8px, -0.75px);
        }
        .chess-piece-w .chess-piece-final-chroma-a {
          filter:
            brightness(0)
            saturate(100%)
            invert(57%)
            sepia(93%)
            saturate(552%)
            hue-rotate(118deg)
            brightness(112%)
            contrast(104%);
        }
        .chess-piece-w .chess-piece-final-chroma-b {
          opacity: 0.42;
          filter:
            brightness(0)
            saturate(100%)
            invert(86%)
            sepia(46%)
            saturate(1148%)
            hue-rotate(165deg)
            brightness(107%)
            contrast(103%);
        }
        .chess-piece-b .chess-piece-final-chroma {
          opacity: 0.54;
        }
        .chess-piece-b .chess-piece-final-chroma-a {
          filter:
            brightness(0)
            saturate(100%)
            invert(13%)
            sepia(95%)
            saturate(2600%)
            hue-rotate(258deg)
            brightness(92%)
            contrast(112%);
        }
        .chess-piece-b .chess-piece-final-chroma-b {
          opacity: 0.42;
          filter:
            brightness(0)
            saturate(100%)
            invert(52%)
            sepia(88%)
            saturate(1098%)
            hue-rotate(180deg)
            brightness(104%)
            contrast(106%);
        }
        .chess-piece-final-tint,
        .chess-piece-final-specular,
        .chess-piece-final-scan {
          -webkit-mask-image: var(--piece-mask-image);
          mask-image: var(--piece-mask-image);
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-size: 88% 87%;
          mask-size: 88% 87%;
          -webkit-mask-position: center 48%;
          mask-position: center 48%;
        }
        .chess-piece-final-tint {
          z-index: 4;
          inset: 0;
          opacity: 1;
          mix-blend-mode: multiply;
          background:
            linear-gradient(145deg, #57f6eb 0%, #b7fff8 33%, #18c9bd 70%, #90fff5 100%);
        }
        .chess-piece-w .chess-piece-final-tint::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 42% 22%, rgba(234, 255, 253, 0.42), transparent 30%),
            linear-gradient(180deg, rgba(148, 255, 248, 0.18), rgba(15, 176, 166, 0.16));
          mix-blend-mode: screen;
        }
        .chess-piece-b .chess-piece-final-tint {
          opacity: 0.52;
          mix-blend-mode: screen;
          background: linear-gradient(135deg, rgba(52, 22, 112, 0.75), rgba(92, 51, 190, 0.38) 44%, rgba(30, 12, 75, 0.7));
        }
        .chess-piece-final-specular {
          z-index: 5;
          inset: 0;
          mix-blend-mode: screen;
          opacity: 0.34;
          background:
            linear-gradient(135deg, rgba(197, 255, 251, 0.46) 0%, rgba(137, 255, 246, 0.12) 24%, transparent 48%),
            radial-gradient(circle at 42% 18%, rgba(187, 255, 250, 0.34), transparent 28%),
            linear-gradient(90deg, transparent 0 42%, rgba(104, 255, 242, 0.16) 49%, transparent 58%);
        }
        .chess-piece-b .chess-piece-final-specular {
          opacity: 0.3;
          background:
            linear-gradient(135deg, rgba(86, 47, 169, 0.34), rgba(48, 24, 103, 0.08) 26%, transparent 48%),
            radial-gradient(circle at 38% 20%, rgba(105, 66, 199, 0.26), transparent 30%),
            linear-gradient(90deg, transparent 0 44%, rgba(79, 48, 173, 0.14) 51%, transparent 60%);
        }
        .chess-piece-final-scan {
          z-index: 6;
          inset: 0;
          opacity: 0.1;
          mix-blend-mode: overlay;
          background:
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.42) 0 1px, transparent 1px 5px),
            repeating-linear-gradient(90deg, rgba(158, 255, 248, 0.2) 0 1px, transparent 1px 8px);
        }
        .chess-piece-b .chess-piece-final-scan {
          opacity: 0.14;
          mix-blend-mode: screen;
          background:
            repeating-linear-gradient(0deg, rgba(131, 91, 220, 0.36) 0 1px, transparent 1px 5px),
            repeating-linear-gradient(90deg, rgba(79, 45, 161, 0.22) 0 1px, transparent 1px 8px);
        }
        .chess-piece-core {
          opacity: 1;
          filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.62))
            drop-shadow(0 0 2px rgba(188, 255, 255, 0.18));
        }
        .chess-piece-b .chess-piece-core {
          opacity: 0.96;
          filter: drop-shadow(0 0 1px rgba(76, 237, 255, 0.65))
            drop-shadow(0 1px 0 rgba(0, 0, 0, 0.82));
        }
        .chess-piece-halftone {
          opacity: 0.28;
          mix-blend-mode: screen;
        }
        .chess-piece-glow {
          opacity: 0.5;
          mix-blend-mode: screen;
          filter: drop-shadow(0 0 3px rgba(75, 242, 255, 0.42));
        }
        .chess-piece-rim {
          opacity: 0.18;
          transform: scale(1.035);
          transform-origin: 50% 58%;
          mix-blend-mode: screen;
          filter: blur(0.35px);
        }
        .chess-piece-aura {
          opacity: 0.12;
          transform: scale(1.13);
          transform-origin: 50% 58%;
          mix-blend-mode: screen;
          filter: blur(2.2px);
        }
        .chess-piece-b .chess-piece-halftone {
          opacity: 0.42;
        }
        .chess-piece-b .chess-piece-glow {
          opacity: 0.72;
        }
        .chess-piece-b .chess-piece-rim {
          opacity: 0.34;
        }
        .chess-piece-b .chess-piece-aura {
          opacity: 0.2;
        }
        .lifted-piece-outline {}
        .lifted-piece-ghost {}

        @keyframes dotmaxDitherPulseA {
          0% { opacity: 0.92; }
          50% { opacity: 0.24; }
          100% { opacity: 0.92; }
        }

        @keyframes dotmaxDitherPulseB {
          0% { opacity: 0.14; }
          50% { opacity: 0.82; }
          100% { opacity: 0.14; }
        }
      `}</style>
    </div>
  );
};
