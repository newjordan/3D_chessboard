"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, PresentationControls, Stage, PerspectiveCamera } from '@react-three/drei';
import { Board3D } from './Board3D';
import { Piece3D } from './Piece3D';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface ReplayControllerProps {
  pgn: string;
}

export const ReplayController: React.FC<ReplayControllerProps> = ({ pgn }) => {
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [currentPly, setCurrentPly] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);

  // Split PGN into multiple games if they exist
  const gamesList = useMemo(() => {
    if (!pgn) return [];
    // Split by [Event tag at the start of a line, then clean up segments
    const segments = pgn.trim()
      .split(/\n(?=\[Event )/)
      .map(s => s.trim())
      .filter(s => s.length > 10); // Ignore tiny fragments
    return segments.length > 0 ? segments : [pgn];
  }, [pgn]);

  const currentGamePgn = useMemo(() => {
    return gamesList[selectedGameIndex] || "";
  }, [gamesList, selectedGameIndex]);

  const history = useMemo(() => {
    if (!currentGamePgn) return [];
    const tempChess = new Chess();
    try {
      // Clean segments to avoid syntax errors on trailing results
      // chess.js 1.x is sensitive to multiple outcome markers
      const cleanPgn = currentGamePgn.replace(/(1-0|0-1|1\/2-1\/2)$/, '').trim();
      tempChess.loadPgn(cleanPgn);
      return tempChess.history({ verbose: true });
    } catch (e) {
      // Fallback: try loading without cleanup if it failed
      try {
        tempChess.loadPgn(currentGamePgn);
        return tempChess.history({ verbose: true });
      } catch (innerError) {
        console.error("Failed to parse PGN:", innerError);
        return [];
      }
    }
  }, [currentGamePgn]);

  // Reset ply when switching games
  useEffect(() => {
    setCurrentPly(0);
    setIsPlaying(false);
  }, [selectedGameIndex]);

  // Derive board state at currentPly
  const boardState = useMemo(() => {
    const tempChess = new Chess();
    for (let i = 0; i < currentPly; i++) {
      tempChess.move(history[i]);
    }
    return tempChess.board();
  }, [currentPly, history]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && currentPly < history.length) {
      interval = setInterval(() => {
        setCurrentPly((prev) => prev + 1);
      }, playbackSpeed);
    } else {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentPly, history.length, playbackSpeed]);

  const pieceComponents = useMemo(() => {
    const pieces: React.ReactNode[] = [];
    boardState.forEach((row, r) => {
      row.forEach((square, c) => {
        if (square) {
          pieces.push(
            <Piece3D 
              key={`${square.type}-${square.color}-${r}-${c}`}
              type={square.type}
              color={square.color}
              position={[c - 3.5, 0, r - 3.5]}
            />
          );
        }
      });
    });
    return pieces;
  }, [boardState]);

  return (
    <div className="flex flex-col gap-8 w-full  mx-auto">
      {/* Header with Game Selection */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-4">
          <span className="technical-label opacity-40 uppercase text-[10px]">Select Game</span>
          <div className="flex gap-2">
            {gamesList.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedGameIndex(idx)}
                className={`px-4 py-1.5 technical-label text-[10px] border transition-all ${
                  selectedGameIndex === idx 
                    ? 'bg-foreground text-background border-foreground font-bold' 
                    : 'bg-white/5 border-white/10 opacity-60 hover:opacity-100'
                }`}
              >
                Game {idx + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3D Scene Container - Larger for full page */}
      <div className="aspect-[16/10] relative w-full border border-white/5 bg-black/40 soft-shadow overflow-hidden rounded-xl">
        <Canvas 
          shadows
          onCreated={({ gl }) => {
            // Address deprecation: PCFSoftShadowMap -> PCFShadowMap
            gl.shadowMap.type = 1; // PCFShadowMap
          }}
          gl={{ antialias: true, alpha: true }}
        >
          <PerspectiveCamera makeDefault position={[0, 10, 10]} fov={45} />
          
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} castShadow />
          <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
          
          <PresentationControls
            global
            rotation={[0, 0, 0]}
            polar={[-Math.PI / 4, Math.PI / 4]}
            azimuth={[-Math.PI / 4, Math.PI / 4]}
          >
            <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
               <Board3D />
               {pieceComponents}
               <ContactShadows 
                 position={[0, -0.2, 0]} 
                 opacity={0.4} 
                 scale={10} 
                 blur={2} 
                 far={0.5} 
               />
            </group>
          </PresentationControls>
          
          <Environment preset="city" />
        </Canvas>

        {/* HUD Move Indicator */}
        <div className="absolute top-6 left-6 technical-label px-3 py-1 bg-black/60 border border-white/10 backdrop-blur-md">
          Ply {currentPly} / {history.length}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-6 p-8 bg-white/[0.02] border border-white/5 rounded-xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
              <button 
                onClick={() => { setCurrentPly(0); setIsPlaying(false); }}
                className="p-2 hover:bg-white/10 transition-colors rounded-lg border border-white/5"
              >
                <RotateCcw size={16} />
              </button>
              <button 
                onClick={() => setCurrentPly(Math.max(0, currentPly - 1))}
                className="p-2 hover:bg-white/10 transition-colors rounded-lg border border-white/5"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-12 h-12 flex items-center justify-center bg-accent text-accent-foreground rounded-full hover:scale-105 transition-all shadow-lg shadow-accent/20"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
              </button>
              <button 
                onClick={() => setCurrentPly(Math.min(history.length, currentPly + 1))}
                className="p-2 hover:bg-white/10 transition-colors rounded-lg border border-white/5"
              >
                <ChevronRight size={20} />
              </button>
           </div>

           <div className="flex flex-col items-end gap-1">
              <span className="technical-label opacity-40 uppercase text-[9px]">Speed</span>
              <select 
                value={playbackSpeed} 
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="bg-transparent border-none text-xs technical-label cursor-pointer hover:text-accent transition-colors outline-none"
              >
                <option value={2000}>0.5x</option>
                <option value={1000}>1.0x</option>
                <option value={500}>2.0x</option>
                <option value={250}>4.0x</option>
              </select>
           </div>
        </div>

        {/* Scrub bar */}
        <input 
          type="range" 
          min={0} 
          max={history.length} 
          value={currentPly}
          onChange={(e) => setCurrentPly(Number(e.target.value))}
          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
        />

        {/* Move History Strip */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {history.map((move, i) => (
            <button 
              key={i}
              onClick={() => setCurrentPly(i + 1)}
              className={`px-3 py-1 text-[10px] font-mono border transition-all flex-shrink-0 ${
                currentPly === i + 1 
                  ? 'bg-accent border-accent text-accent-foreground' 
                  : 'bg-black/40 border-white/5 opacity-40 hover:opacity-100'
              }`}
            >
              {Math.floor(i/2) + 1}{i%2 === 0 ? '.' : '...'} {move.san}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
