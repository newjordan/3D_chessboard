"use client";

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createDotVfxRuntime, type DotVfxRuntime } from './dotVfx';

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

const dotmaxPieceMap: Record<string, string> = {
  king: '01_king.png',
  queen: '02_queen.png',
  rook: '03_rook.png',
  bishop: '04_bishop.png',
  knight: '05_knight.png',
  pawn: '06_pawn.png',
};

const pieceScaleMap: Record<string, number> = {
  king: 1.08,
  queen: 1.02,
  rook: 0.94,
  bishop: 0.98,
  knight: 1.0,
  pawn: 0.84,
};

const DOTMAX_ASSET_VERSION = '4';
const DOTMAX_DITHER_MODES = {
  outlineA: 'bayer',
  outlineB: 'atkinson',
  interiorA: 'floyd',
  interiorB: 'none',
} as const;

function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}


const PieceImage = ({ color, type, squareId }: { color: string; type: string; squareId: string }) => {
  const name = pieceNameMap[type.toLowerCase()];
  const index = layeredPieceIndexMap[name];
  const isWhite = color === 'w';
  const dotmaxFile = dotmaxPieceMap[name];

  if (dotmaxFile) {
    const variantDir = isWhite ? 'white' : 'black';
    const modeSrc = (mode: string) =>
      `/replay/dotmax-piece-set/modes/${mode}/${variantDir}/${dotmaxFile}?v=${DOTMAX_ASSET_VERSION}`;
    const legacySrc = `/replay/dotmax-piece-set/${variantDir}/${dotmaxFile}?v=${DOTMAX_ASSET_VERSION}`;
    const outlineA = modeSrc(DOTMAX_DITHER_MODES.outlineA);
    const outlineB = modeSrc(DOTMAX_DITHER_MODES.outlineB);
    const interiorA = modeSrc(DOTMAX_DITHER_MODES.interiorA);
    const interiorB = modeSrc(DOTMAX_DITHER_MODES.interiorB);

    const pieceScale = pieceScaleMap[name] ?? 1;
    const seed = hashSeed(`${squareId}-${name}-${color}`);
    const cycle = 3.6 + ((seed % 400) / 400) * 2.4;
    const phase = -(((seed >>> 8) % 1000) / 1000) * cycle;
    const outlineCycle = cycle * 1.27;
    const outlinePhase = phase * 0.63;

    return (
      <div
        className="relative w-full h-full select-none pointer-events-none"
        style={{ transform: `scale(${pieceScale})`, transformOrigin: '50% 100%' }}
        aria-label={`${color} ${name}`}
        role="img"
      >
        <div className="absolute inset-0 [transform:scale(1.05)]">
          <img
            src={outlineA}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-contain mix-blend-screen ${
              isWhite
                ? 'opacity-[0.44] [filter:brightness(1.08)_saturate(0.74)_contrast(1.04)]'
                : 'opacity-[0.3] [filter:brightness(1.02)_saturate(0.62)_contrast(1.03)]'
            }`}
            style={{ animation: `dotmaxDitherPulseA ${outlineCycle}s ease-in-out ${outlinePhase}s infinite` }}
          />
          <img
            src={outlineB}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-contain mix-blend-screen ${
              isWhite
                ? 'opacity-[0.22] [filter:brightness(1.02)_saturate(0.7)_contrast(1.02)]'
                : 'opacity-[0.2] [filter:brightness(0.99)_saturate(0.55)_contrast(1.02)]'
            }`}
            style={{ animation: `dotmaxDitherPulseB ${outlineCycle}s ease-in-out ${outlinePhase}s infinite` }}
          />
        </div>
        <img
          src={interiorA}
          alt={`${color} ${name}`}
          className={`absolute inset-0 w-full h-full object-contain [image-rendering:auto] ${
            isWhite
              ? 'opacity-[0.96] [filter:brightness(1.16)_saturate(0.8)_contrast(1.05)] drop-shadow-[0_0_8px_rgba(126,188,232,0.34)]'
              : 'opacity-[0.9] [filter:brightness(1.03)_saturate(0.64)_contrast(1.04)] drop-shadow-[0_0_7px_rgba(74,128,170,0.3)]'
          }`}
          style={{ animation: `dotmaxDitherPulseA ${cycle}s ease-in-out ${phase}s infinite` }}
        />
        <img
          src={interiorB}
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-contain mix-blend-screen ${
            isWhite
              ? 'opacity-[0.2] [filter:brightness(1.14)_saturate(0.68)_contrast(1.02)]'
              : 'opacity-[0.16] [filter:brightness(1.05)_saturate(0.5)_contrast(1.01)]'
          }`}
          style={{ animation: `dotmaxDitherPulseB ${cycle}s ease-in-out ${phase}s infinite` }}
        />
        <img
          src={legacySrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain opacity-0 pointer-events-none"
        />
        <div
          className={`absolute inset-0 ${
            isWhite
              ? 'bg-[radial-gradient(circle_at_50%_14%,rgba(208,230,252,0.13),transparent_58%)]'
              : 'bg-[radial-gradient(circle_at_50%_16%,rgba(90,132,176,0.1),transparent_58%)]'
          }`}
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

export const Board2D: React.FC<Board2DProps> = (props) => {
  const { board, lastMove, fxMove, fxKey, fxSpeed = 1 } = props;
  const boardCanvasWrapRef = useRef<HTMLDivElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const vfxRuntimeRef = useRef<DotVfxRuntime | null>(null);

  const ensureVfxRuntime = (): DotVfxRuntime | null => {
    if (vfxRuntimeRef.current) return vfxRuntimeRef.current;
    const canvas = fxCanvasRef.current;
    if (!canvas) return null;
    vfxRuntimeRef.current = createDotVfxRuntime({ canvas, maxEffects: 96 });
    return vfxRuntimeRef.current;
  };

  const syncCanvasResolution = () => {
    const wrap = boardCanvasWrapRef.current;
    if (!wrap) return;

    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const runtime = ensureVfxRuntime();
    if (!runtime) return;
    runtime.resize(rect.width, rect.height, window.devicePixelRatio || 1);
  };

  const drawFrame = (now: number) => {
    const runtime = vfxRuntimeRef.current;
    if (!runtime) {
      rafRef.current = null;
      return;
    }
    const alive = runtime.render(now);
    if (!alive) {
      rafRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(drawFrame);
  };

  useEffect(() => {
    const wrap = boardCanvasWrapRef.current;
    if (!wrap) return;
    ensureVfxRuntime();
    syncCanvasResolution();

    const ro = new ResizeObserver(() => {
      syncCanvasResolution();
    });

    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      vfxRuntimeRef.current?.destroy();
      vfxRuntimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!fxMove || !fxMove.from || !fxMove.to) return;
    const runtime = ensureVfxRuntime();
    if (!runtime) return;
    syncCanvasResolution();
    runtime.trigger({
      type: 'move',
      key: `${fxKey ?? 0}-${fxMove.from}-${fxMove.to}-${fxMove.flags ?? ''}-${fxMove.captured ?? ''}`,
      from: fxMove.from,
      to: fxMove.to,
      flags: fxMove.flags,
      captured: fxMove.captured,
      speed: fxSpeed,
    });

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(drawFrame);
    }
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
                        squareId={squareId}
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
      <style jsx global>{`
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
