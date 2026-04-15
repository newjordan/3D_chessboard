"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Board2DProps {
  board: ({ type: string; color: string } | null)[][];
  lastMove?: { from: string; to: string } | null;
  whitePieceUrl?: string;
  blackPieceUrl?: string;
}

const FILE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const RANK_LABELS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const pieceNameMap: Record<string, string> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
};

const PieceImage = ({ color, type, customUrl }: { color: string; type: string; customUrl?: string }) => {
  const name = pieceNameMap[type.toLowerCase()];
  const defaultSrc = `/replay/neuro-grid/pieces/${name}-${color === 'w' ? 'w' : 'b'}.png`;
  const src = customUrl || defaultSrc;

  return (
    <img
      src={src}
      alt={`${color} ${name}`}
      className="w-[84%] h-[84%] object-contain select-none pointer-events-none"
    />
  );
};

export const Board2D: React.FC<Board2DProps> = ({ board, lastMove, whitePieceUrl, blackPieceUrl }) => {
  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-white/10 bg-[#0a0d12]">
      <div className="absolute left-[8%] right-[8%] top-[8%] bottom-[8%]">
        <div className="absolute -top-5 inset-x-0 grid grid-cols-8 text-[11px] font-mono tracking-[0.2em] text-white/55">
          {FILE_LABELS.map((file) => (
            <span key={`top-${file}`} className="text-center">{file}</span>
          ))}
        </div>

        <div className="absolute -bottom-5 inset-x-0 grid grid-cols-8 text-[11px] font-mono tracking-[0.2em] text-white/55">
          {FILE_LABELS.map((file) => (
            <span key={`bottom-${file}`} className="text-center">{file}</span>
          ))}
        </div>

        <div className="absolute -left-6 inset-y-0 grid grid-rows-8 text-[11px] font-mono text-white/55">
          {RANK_LABELS.map((rank) => (
            <span key={`left-${rank}`} className="self-center">{rank}</span>
          ))}
        </div>

        <div className="absolute -right-6 inset-y-0 grid grid-rows-8 text-[11px] font-mono text-white/35">
          {RANK_LABELS.map((rank) => (
            <span key={`right-${rank}`} className="self-center text-right">{rank}</span>
          ))}
        </div>

        <div className="relative grid grid-cols-8 grid-rows-8 w-full h-full rounded-md overflow-hidden border border-white/20">
          {board.map((row, r) =>
            row.map((square, c) => {
              const isDark = (r + c) % 2 === 1;
              const squareId = `${'abcdefgh'[c]}${8 - r}`;
              const isHighlighted = lastMove && (lastMove.from === squareId || lastMove.to === squareId);

              return (
                <div
                  key={`${r}-${c}`}
                  className={[
                    'relative flex items-center justify-center border border-white/10',
                    isDark ? 'bg-[#1a1f29]' : 'bg-[#232a36]',
                  ].join(' ')}
                >
                  {isHighlighted && (
                    <>
                      <div className="absolute inset-[10%] border border-white/60" />
                      <div className="absolute inset-0 bg-white/10" />
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
        </div>
      </div>
    </div>
  );
};
