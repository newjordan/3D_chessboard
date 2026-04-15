"use client";

import React, { useEffect, useRef } from 'react';
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

type Vec2 = { x: number; y: number };

type PolylineMetrics = {
  points: Vec2[];
  cumulative: number[];
  total: number;
};

type CaptureParticle = {
  dir1: Vec2;
  dir2: Vec2;
  dist1: number;
  dist2: number;
  size: number;
  delay: number;
};

type ActiveMoveFx = {
  startedAt: number;
  pingEnd: number;
  lightningStart: number;
  lightningEnd: number;
  captureStart: number;
  captureEnd: number;
  isCapture: boolean;
  toSquare: string;
  captureSquare: string;
  lightningPath: PolylineMetrics;
  particles: CaptureParticle[];
};

const FILE_IDS = 'abcdefgh';

const pieceNameMap: Record<string, string> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
};

const layeredPieceIndexMap: Record<string, number> = {
  queen: 0,
  king: 1,
  rook: 2,
  pawn: 3,
  bishop: 4,
  knight: 5,
};

const whiteCleanPieceMap: Record<string, string> = {
  king: '01_king.png',
  queen: '02_queen.png',
  rook: '03_rook.png',
  bishop: '04_bishop.png',
  knight: '05_knight.png',
  pawn: '06_pawn.png',
};

const pieceScaleMap: Record<string, number> = {
  king: 1.0,
  queen: 0.97,
  rook: 0.9,
  bishop: 0.88,
  knight: 0.9,
  pawn: 0.7,
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = (t: number) => Math.pow(clamp(t), 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function makeSeeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function squareToCenter(square: string, cell: number): Vec2 {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const row = 8 - rank;
  return {
    x: (file + 0.5) * cell,
    y: (row + 0.5) * cell,
  };
}

function buildPolyline(points: Vec2[]): PolylineMetrics {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }

  return {
    points,
    cumulative,
    total: cumulative[cumulative.length - 1] ?? 0,
  };
}

function pointAtPolylineDistance(polyline: PolylineMetrics, distance: number): Vec2 {
  const d = clamp(distance, 0, polyline.total);
  for (let i = 1; i < polyline.cumulative.length; i++) {
    const start = polyline.cumulative[i - 1];
    const end = polyline.cumulative[i];
    if (d <= end) {
      const segmentT = end === start ? 0 : (d - start) / (end - start);
      return {
        x: polyline.points[i - 1].x + (polyline.points[i].x - polyline.points[i - 1].x) * segmentT,
        y: polyline.points[i - 1].y + (polyline.points[i].y - polyline.points[i - 1].y) * segmentT,
      };
    }
  }

  return polyline.points[polyline.points.length - 1] ?? { x: 0, y: 0 };
}

function drawPolylineSegment(
  ctx: CanvasRenderingContext2D,
  polyline: PolylineMetrics,
  fromDistance: number,
  toDistance: number
): void {
  const start = clamp(Math.min(fromDistance, toDistance), 0, polyline.total);
  const end = clamp(Math.max(fromDistance, toDistance), 0, polyline.total);
  if (end <= start) return;

  const steps = Math.max(8, Math.floor((end - start) / 6));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = start + (end - start) * (i / steps);
    const p = pointAtPolylineDistance(polyline, t);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function drawBracket(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  size: number,
  alpha: number,
  color = 'rgba(0,255,204,1)'
): void {
  const s = size;
  const l = size * 0.35;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(center.x - s, center.y - s + l);
  ctx.lineTo(center.x - s, center.y - s);
  ctx.lineTo(center.x - s + l, center.y - s);

  ctx.moveTo(center.x + s - l, center.y - s);
  ctx.lineTo(center.x + s, center.y - s);
  ctx.lineTo(center.x + s, center.y - s + l);

  ctx.moveTo(center.x - s, center.y + s - l);
  ctx.lineTo(center.x - s, center.y + s);
  ctx.lineTo(center.x - s + l, center.y + s);

  ctx.moveTo(center.x + s - l, center.y + s);
  ctx.lineTo(center.x + s, center.y + s);
  ctx.lineTo(center.x + s, center.y + s - l);
  ctx.stroke();
}

function buildLightningPath(from: string, to: string, cell: number): PolylineMetrics {
  const start = squareToCenter(from, cell);
  const end = squareToCenter(to, cell);

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const snapX = dx !== 0 ? start.x + (dx > 0 ? cell * 0.5 : -cell * 0.5) : start.x;
  const snapY = dy !== 0 ? start.y + (dy > 0 ? cell * 0.5 : -cell * 0.5) : start.y;

  const targetX = dx !== 0 ? end.x + (dx > 0 ? -cell * 0.5 : cell * 0.5) : end.x;
  const targetY = dy !== 0 ? end.y + (dy > 0 ? -cell * 0.5 : cell * 0.5) : end.y;

  return buildPolyline([
    { x: snapX, y: snapY },
    { x: snapX, y: targetY },
    { x: targetX, y: targetY },
    { x: end.x, y: end.y },
  ]);
}

function createMoveFx(move: Board2DMoveFx, cell: number, speed: number): ActiveMoveFx {
  const now = performance.now();
  const scale = 1 / Math.max(speed, 0.25);

  const pingDuration = 430 * scale;
  const lightningDuration = 1150 * scale;
  const captureDuration = 820 * scale;

  const lightningStart = now + pingDuration;
  const lightningEnd = lightningStart + lightningDuration;

  const flags = move.flags ?? '';
  const isCapture = Boolean(move.captured || flags.includes('e'));
  const captureSquare = flags.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to;

  const rng = makeSeeded(`${move.from}-${move.to}-${flags}`);
  const orthogonal = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  const particles: CaptureParticle[] = Array.from({ length: 12 }, () => {
    const dir1 = orthogonal[Math.floor(rng() * orthogonal.length)];
    const dir2Options = dir1.x === 0 ? [{ x: 1, y: 0 }, { x: -1, y: 0 }] : [{ x: 0, y: 1 }, { x: 0, y: -1 }];
    const dir2 = dir2Options[Math.floor(rng() * 2)];

    return {
      dir1,
      dir2,
      dist1: 0.5 + Math.floor(rng() * 2),
      dist2: 1 + Math.floor(rng() * 3),
      size: 1.8 + rng() * 2.2,
      delay: rng() * 0.2,
    };
  });

  return {
    startedAt: now,
    pingEnd: now + pingDuration,
    lightningStart,
    lightningEnd,
    captureStart: lightningEnd,
    captureEnd: lightningEnd + (isCapture ? captureDuration : 0),
    isCapture,
    toSquare: move.to,
    captureSquare,
    lightningPath: buildLightningPath(move.from, move.to, cell),
    particles,
  };
}

function renderMoveFx(ctx: CanvasRenderingContext2D, fx: ActiveMoveFx, now: number, cell: number): boolean {
  let active = false;

  const toCenter = squareToCenter(fx.toSquare, cell);
  const toTopLeft = { x: toCenter.x - cell * 0.5, y: toCenter.y - cell * 0.5 };

  if (now <= fx.pingEnd) {
    active = true;
    const pingProgress = clamp((now - fx.startedAt) / (fx.pingEnd - fx.startedAt));

    let flashAlpha = 0;
    if (pingProgress < 0.22) flashAlpha = easeOut(pingProgress / 0.22) * 0.9;
    else if (pingProgress < 0.42) flashAlpha = (1 - easeIn((pingProgress - 0.22) / 0.2)) * 0.9;
    else if (pingProgress < 0.62) flashAlpha = easeOut((pingProgress - 0.42) / 0.2) * 0.65;
    else flashAlpha = (1 - easeIn((pingProgress - 0.62) / 0.38)) * 0.65;

    const ringRadius = cell * (0.22 + pingProgress * 0.8);

    ctx.save();
    ctx.globalAlpha = flashAlpha * 0.3;
    ctx.fillStyle = '#8bddff';
    ctx.fillRect(toTopLeft.x + cell * 0.03, toTopLeft.y + cell * 0.03, cell * 0.94, cell * 0.94);

    ctx.globalAlpha = flashAlpha * 0.8;
    ctx.strokeStyle = '#d8f7ff';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(toTopLeft.x + cell * 0.08, toTopLeft.y + cell * 0.08, cell * 0.84, cell * 0.84);

    ctx.globalAlpha = flashAlpha * 0.7;
    ctx.strokeStyle = '#a7ecff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(toCenter.x, toCenter.y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (now >= fx.lightningStart && now <= fx.lightningEnd) {
    active = true;
    const lp = clamp((now - fx.lightningStart) / (fx.lightningEnd - fx.lightningStart));
    const headDistance = fx.lightningPath.total * (lp * 1.05);
    const tailDistance = Math.max(0, headDistance - fx.lightningPath.total * 0.42);
    const head = pointAtPolylineDistance(fx.lightningPath, headDistance);

    ctx.save();
    drawPolylineSegment(ctx, fx.lightningPath, tailDistance, headDistance);
    ctx.lineCap = 'round';

    ctx.strokeStyle = 'rgba(0,255,255,0.16)';
    ctx.lineWidth = 8;
    ctx.stroke();

    drawPolylineSegment(ctx, fx.lightningPath, tailDistance, headDistance);
    ctx.strokeStyle = 'rgba(0,255,255,0.85)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const bracketScale = 0.68 + easeOut(lp) * 0.36;
    const bracketAlpha = lp < 0.1 ? lp / 0.1 : 1 - clamp((lp - 0.85) / 0.15);
    drawBracket(ctx, head, cell * 0.24 * bracketScale, bracketAlpha);

    ctx.globalAlpha = bracketAlpha;
    ctx.fillStyle = 'rgba(0,255,204,1)';
    ctx.beginPath();
    ctx.arc(head.x, head.y, cell * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (fx.isCapture && now >= fx.captureStart && now <= fx.captureEnd) {
    active = true;
    const cp = clamp((now - fx.captureStart) / (fx.captureEnd - fx.captureStart));
    const captureCenter = squareToCenter(fx.captureSquare, cell);
    const tl = { x: captureCenter.x - cell * 0.5, y: captureCenter.y - cell * 0.5 };

    ctx.save();

    const borderProgress = easeOut(clamp(cp / 0.34));
    ctx.globalAlpha = (1 - clamp((cp - 0.48) / 0.52)) * 0.9;
    ctx.strokeStyle = '#00ff77';
    ctx.lineWidth = 1.6;
    const borderInset = cell * (0.45 - borderProgress * 0.4);
    ctx.strokeRect(
      tl.x + borderInset,
      tl.y + borderInset,
      cell - borderInset * 2,
      cell - borderInset * 2
    );

    const ghostProgress = clamp((cp - 0.2) / 0.8);
    const ghostRadius = cell * (0.24 + ghostProgress * 0.85);
    ctx.globalAlpha = (1 - ghostProgress) * 0.7;
    ctx.strokeStyle = '#00ff77';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(captureCenter.x, captureCenter.y, ghostRadius, 0, Math.PI * 2);
    ctx.stroke();

    fx.particles.forEach((particle) => {
      const particleProgress = clamp((cp - particle.delay) / (1 - particle.delay));
      if (particleProgress <= 0) return;

      let x = captureCenter.x;
      let y = captureCenter.y;
      if (particleProgress < 0.45) {
        const t = particleProgress / 0.45;
        x += particle.dir1.x * particle.dist1 * cell * 0.5 * easeInOut(t);
        y += particle.dir1.y * particle.dist1 * cell * 0.5 * easeInOut(t);
      } else {
        const t = (particleProgress - 0.45) / 0.55;
        x += particle.dir1.x * particle.dist1 * cell * 0.5;
        y += particle.dir1.y * particle.dist1 * cell * 0.5;
        x += particle.dir2.x * particle.dist2 * cell * 0.34 * easeOut(t);
        y += particle.dir2.y * particle.dist2 * cell * 0.34 * easeOut(t);
      }

      ctx.globalAlpha = (1 - particleProgress) * 0.95;
      ctx.fillStyle = '#00ff99';
      ctx.fillRect(x - particle.size * 0.5, y - particle.size * 0.5, particle.size, particle.size);
    });

    ctx.restore();
  }

  return active;
}

const PieceImage = ({ color, type, customUrl }: { color: string; type: string; customUrl?: string }) => {
  const name = pieceNameMap[type.toLowerCase()];
  const index = layeredPieceIndexMap[name];
  const whiteCleanFile = whiteCleanPieceMap[name];

  if (customUrl) {
    return (
      <img
        src={customUrl}
        alt={`${color} ${name}`}
        className="w-[84%] h-[84%] object-contain select-none pointer-events-none drop-shadow-[0_0_10px_rgba(125,210,255,0.2)]"
      />
    );
  }

  if (whiteCleanFile) {
    const pieceSrc = `/replay/openai-piece-set/white/${whiteCleanFile}?v=3`;
    const maskStyle: React.CSSProperties = {
      WebkitMaskImage: `url(${pieceSrc})`,
      maskImage: `url(${pieceSrc})`,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
      maskSize: 'contain',
      WebkitMaskPosition: 'center',
      maskPosition: 'center',
    };
    const isWhite = color === 'w';
    const pieceScale = pieceScaleMap[name] ?? 1;

    return (
      <div
        className="relative w-[106%] h-[106%] select-none pointer-events-none"
        style={{ transform: `scale(${pieceScale})`, transformOrigin: '50% 100%' }}
        aria-label={`${color} ${name}`}
        role="img"
      >
        <img
          src={pieceSrc}
          alt={`${color} ${name}`}
          className={`absolute inset-0 w-full h-full object-contain [image-rendering:pixelated] ${
            isWhite
              ? 'opacity-100 [filter:brightness(1.42)_saturate(1.0)_contrast(1.28)] drop-shadow-[0_0_1px_rgba(225,243,255,0.92)] drop-shadow-[0_0_10px_rgba(116,194,243,0.58)]'
              : 'opacity-[0.9] [filter:brightness(0.74)_saturate(0.36)_contrast(1.2)] drop-shadow-[0_0_1px_rgba(88,145,188,0.62)] drop-shadow-[0_0_7px_rgba(58,106,148,0.42)]'
          }`}
        />
        <img
          src={pieceSrc}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-contain [image-rendering:pixelated] mix-blend-screen ${
            isWhite
              ? 'opacity-[0.4] [filter:brightness(1.16)_saturate(0.88)_contrast(1.05)] drop-shadow-[0_0_12px_rgba(95,174,221,0.52)]'
              : 'opacity-[0.22] [filter:brightness(0.98)_saturate(0.46)_contrast(1.04)] drop-shadow-[0_0_10px_rgba(64,128,178,0.42)]'
          }`}
        />
        <div
          className={`absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(205,225,248,0.76)_0px,rgba(205,225,248,0.76)_1px,transparent_1px,transparent_3px)] ${
            isWhite ? 'opacity-[0.11]' : 'opacity-[0.07]'
          }`}
          style={maskStyle}
        />
      </div>
    );
  }

  if (index == null) {
    const fallbackSrc = `/${name}-${color}.svg`;
    return (
      <img
        src={fallbackSrc}
        alt={`${color} ${name}`}
        className="w-[84%] h-[84%] object-contain select-none pointer-events-none drop-shadow-[0_0_10px_rgba(125,210,255,0.2)]"
      />
    );
  }

  const silhouetteSrc = `/replay/layered-piece-set/piece_${index}_silhouette.svg`;
  const halftoneSrc = `/replay/layered-piece-set/piece_${index}_halftone.svg`;
  const glowSrc = `/replay/layered-piece-set/piece_${index}_glow.svg`;

  const isWhite = color === 'w';
  const bodyColor = isWhite ? '#dceeff' : '#0b141d';
  const halftoneColor = isWhite ? '#ffffff' : '#2f4358';
  const glowColor = isWhite ? '#7fd7ff' : '#3b89be';

  const makeMaskStyle = (src: string, fill: string): React.CSSProperties => ({
    backgroundColor: fill,
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  });

  return (
    <div
      className="relative w-[90%] h-[90%] select-none pointer-events-none"
      aria-label={`${color} ${name}`}
      role="img"
    >
      <div className="absolute inset-0" style={makeMaskStyle(silhouetteSrc, bodyColor)} />
      <div className="absolute inset-0 opacity-30" style={makeMaskStyle(halftoneSrc, halftoneColor)} />
      <div
        className="absolute inset-0 opacity-85 drop-shadow-[0_0_9px_rgba(85,196,255,0.45)]"
        style={makeMaskStyle(glowSrc, glowColor)}
      />
    </div>
  );
};

export const Board2D: React.FC<Board2DProps> = ({
  board,
  lastMove,
  whitePieceUrl,
  blackPieceUrl,
  fxMove,
  fxKey,
  fxSpeed = 1,
}) => {
  const boardCanvasWrapRef = useRef<HTMLDivElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const activeFxRef = useRef<ActiveMoveFx | null>(null);

  const syncCanvasResolution = () => {
    const wrap = boardCanvasWrapRef.current;
    const canvas = fxCanvasRef.current;
    if (!wrap || !canvas) return;

    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
  };

  const drawFrame = (now: number) => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);

    const fx = activeFxRef.current;
    if (!fx) {
      rafRef.current = null;
      return;
    }

    const alive = renderMoveFx(ctx, fx, now, width / 8);
    if (!alive) {
      activeFxRef.current = null;
      rafRef.current = null;
      return;
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  };

  useEffect(() => {
    syncCanvasResolution();

    const wrap = boardCanvasWrapRef.current;
    if (!wrap) return;

    const ro = new ResizeObserver(() => {
      syncCanvasResolution();
    });

    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!fxMove || !fxMove.from || !fxMove.to) return;

    const canvas = fxCanvasRef.current;
    if (!canvas) return;

    syncCanvasResolution();
    const cell = canvas.clientWidth / 8;
    if (!cell) return;

    activeFxRef.current = createMoveFx(fxMove, cell, fxSpeed);

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [fxKey, fxMove, fxSpeed]);

  return (
    <div className="relative w-full aspect-square overflow-hidden border border-[#2f7ecf]/35 bg-black shadow-[0_0_35px_rgba(58,136,214,0.22)]">
      <div
        className="absolute inset-0 bg-center bg-cover"
        style={{ backgroundImage: "url('/replay/board-2d-bg-from-3d-fullframe.png')" }}
      />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,transparent_62%,rgba(0,0,0,0.46)_100%)]" />

      <div
        ref={boardCanvasWrapRef}
        className="absolute inset-[8.6%] grid grid-cols-8 grid-rows-8"
      >
        {board.map((row, r) =>
          row.map((square, c) => {
            const squareId = `${FILE_IDS[c]}${8 - r}`;
            const isHighlighted = lastMove && (lastMove.from === squareId || lastMove.to === squareId);

            return (
              <div
                key={`${r}-${c}`}
                className="relative flex items-center justify-center"
              >
                {isHighlighted && (
                  <>
                    <div className="absolute inset-[8%] border border-[#a8e2ff]/80 shadow-[0_0_12px_rgba(108,189,255,0.45)]" />
                    <div className="absolute inset-0 bg-[#7ec9ff]/12" />
                  </>
                )}

                <AnimatePresence mode="popLayout">
                  {square && (
                    <motion.div
                      key={`${square.type}-${square.color}-${squareId}`}
                      initial={{ scale: 0.78, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.78, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                      className="w-full h-full flex items-center justify-center z-10"
                    >
                      <PieceImage
                        color={square.color}
                        type={square.type}
                        customUrl={square.color === 'w' ? whitePieceUrl : blackPieceUrl}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}

        <canvas
          ref={fxCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-30"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};
