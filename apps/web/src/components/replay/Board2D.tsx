"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Board2DProps {
  board: ({ type: string; color: string } | null)[][];
  lastMove?: { from: string; to: string } | null;
}

// Minimalist, high-contrast SVG piece set
const PieceImage = ({ color, type }: { color: string; type: string }) => {
  const pieceNameMap: Record<string, string> = {
    'p': 'pawn',
    'r': 'rook',
    'n': 'knight',
    'b': 'bishop',
    'q': 'queen',
    'k': 'king'
  };
  
  const name = pieceNameMap[type.toLowerCase()];
  const src = `/${name}-${color}.svg`;

  return (
    <img 
      src={src} 
      alt={`${color} ${name}`}
      className="w-[85%] h-[85%] drop-shadow-md select-none pointer-events-none"
    />
  );
};

export const Board2D: React.FC<Board2DProps> = ({ board, lastMove }) => {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  
  return (
    <div className="w-full aspect-square bg-[#0a0a0a] border border-white/5 rounded-lg overflow-hidden relative group">
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {board.map((row, r) => 
          row.map((square, c) => {
            const isBlack = (r + c) % 2 === 1;
            const squareId = `${letters[c]}${8-r}`;
            const isHighlighted = lastMove && (lastMove.from === squareId || lastMove.to === squareId);
            
            return (
              <div 
                key={`${r}-${c}`}
                className={`relative flex items-center justify-center ${isBlack ? 'bg-[#1a1a1a]' : 'bg-[#2a2a2a]'} ${isHighlighted ? 'after:absolute after:inset-0 after:bg-accent/10 transition-colors' : ''}`}
              >
                {/* Coordinates */}
                {c === 0 && (
                  <span className={`absolute top-0.5 left-0.5 text-[7px] font-mono select-none ${isBlack ? 'text-white/10' : 'text-black/20'}`}>{8-r}</span>
                )}
                {r === 7 && (
                  <span className={`absolute bottom-0.5 right-0.5 text-[7px] font-mono select-none ${isBlack ? 'text-white/10' : 'text-black/20'}`}>{letters[c]}</span>
                )}

                <AnimatePresence mode="popLayout">
                  {square && (
                    <motion.div
                      key={`${square.type}-${square.color}-${squareId}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="w-full h-full flex items-center justify-center z-10"
                    >
                      <PieceImage color={square.color} type={square.type} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
      
      {/* Gloss overlay Effect */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/[0.02] to-transparent" />
    </div>
  );
};
