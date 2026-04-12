"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Board2DProps {
  board: ({ type: string; color: string } | null)[][];
  lastMove?: { from: string; to: string } | null;
}

// Minimalist, high-contrast SVG piece set
const SVGPiecesHeader = ({ color, type }: { color: string; type: string }) => {
  const isWhite = color === 'w';
  const fill = isWhite ? '#FFFFFF' : '#999999';
  const stroke = isWhite ? '#000000' : '#FFFFFF';

  switch (type.toLowerCase()) {
    case 'p': return (
      <svg viewBox="0 0 45 45" className="w-[80%] h-[80%] drop-shadow-lg">
        <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
    case 'r': return (
      <svg viewBox="0 0 45 45" className="w-[85%] h-[85%] drop-shadow-lg">
        <path d="M9 39h27v-3H9v3zM12 36h21l-2-18H14l-2 18zM9 14V9h3v1h4V9h3v1h5V9h3v1h4V9h3v5H9z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
    case 'n': return (
      <svg viewBox="0 0 45 45" className="w-[85%] h-[85%] drop-shadow-lg">
        <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <path d="M24 18c.3 1.2 1.9 1.2 2.2 0" fill="none" stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
    case 'b': return (
      <svg viewBox="0 0 45 45" className="w-[85%] h-[85%] drop-shadow-lg">
        <path d="M9 36c3.39 0 6.78 0 10.17 0 0 2 0 4 0 6 2 0 4 0 6 0 0-2 0-4 0-6 3.39 0 6.78 0 10.17 0-2-2-4-4-6-6 0-1.71 0-3.41 0-5.12 3-2 3-5 3-5-2.5 4-5 1.5-6 4-.5 1-1 2-1 3.5 0 2 0 4 0 5-2 2-4 4-6 6z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
    case 'q': return (
      <svg viewBox="0 0 45 45" className="w-[90%] h-[90%] drop-shadow-lg">
        <path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13L21 9l-4.5 15L11 11v14L4 14l5 12z" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <path d="M9 26c0 2 1.5 2 2.5 4 2.5 0 5 .5 7.5 .5s5-.5 7.5-.5c1 2 2.5 2 2.5-4h-20z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
    case 'k': return (
      <svg viewBox="0 0 45 45" className="w-[90%] h-[90%] drop-shadow-lg">
        <path d="M22.5 11.63V6M20 8h5" fill="none" stroke={stroke} strokeWidth="1.5" />
        <path d="M22.5 25s4.5-7.5 3-10c-1.5-2.5-6-2.5-6 0-1.5 2.5 3 10 3 10z" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-5.5 1.5-12.5 0C19 11 17.5 8.5 13.5 9.5c-3 6 6 10.5 6 10.5v7h-8z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
    default: return null;
  }
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
                className={`relative flex items-center justify-center ${isBlack ? 'bg-[#1a1a1a]' : 'bg-[#2a2a2a]'} ${isHighlighted ? 'after:absolute after:inset-0 after:bg-accent/10' : ''}`}
              >
                {/* Coordinates */}
                {c === 0 && (
                  <span className="absolute top-1 left-1 text-[8px] font-mono opacity-20">{8-r}</span>
                )}
                {r === 7 && (
                  <span className="absolute bottom-1 right-1 text-[8px] font-mono opacity-20">{letters[c]}</span>
                )}

                <AnimatePresence mode="popLayout">
                  {square && (
                    <motion.div
                      key={`${square.type}-${square.color}`}
                      layoutId={`${square.type}-${square.color}`}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="w-full h-full flex items-center justify-center z-10"
                    >
                      <SVGPiecesHeader color={square.color} type={square.type} />
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
