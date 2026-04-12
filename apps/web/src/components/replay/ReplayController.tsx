"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, PresentationControls, PerspectiveCamera } from '@react-three/drei';
import { Board3D } from './Board3D';
import { Piece3D } from './Piece3D';
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw,
  FastForward,
  Rewind,
  Trophy,
  History as HistoryIcon
} from 'lucide-react';

interface ReplayControllerProps {
  pgn: string;
}

export const ReplayController: React.FC<ReplayControllerProps> = ({ pgn }) => {
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [currentPly, setCurrentPly] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const moveListRef = useRef<HTMLDivElement>(null);

  // Split PGN into multiple games if they exist
  const gamesList = useMemo(() => {
    if (!pgn) return [];
    const segments = pgn.trim()
      .split(/\n(?=\[Event )/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
    return segments.length > 0 ? segments : [pgn];
  }, [pgn]);

  const currentGamePgn = useMemo(() => {
    return gamesList[selectedGameIndex] || "";
  }, [gamesList, selectedGameIndex]);

  const history = useMemo(() => {
    if (!currentGamePgn) return [];
    const tempChess = new Chess();
    try {
      const cleanPgn = currentGamePgn.replace(/(1-0|0-1|1\/2-1\/2)$/, '').trim();
      tempChess.loadPgn(cleanPgn);
      return tempChess.history({ verbose: true });
    } catch (e) {
      try {
        tempChess.loadPgn(currentGamePgn);
        return tempChess.history({ verbose: true });
      } catch (innerError) {
        console.error("Failed to parse PGN:", innerError);
        return [];
      }
    }
  }, [currentGamePgn]);

  // Group history into pairs (1. e4 e5)
  const pairedMoves = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < history.length; i += 2) {
      pairs.push({
        index: Math.floor(i / 2) + 1,
        white: { ply: i + 1, san: history[i].san },
        black: history[i + 1] ? { ply: i + 2, san: history[i + 1].san } : null
      });
    }
    return pairs;
  }, [history]);

  // Auto-scroll move list
  useEffect(() => {
    if (moveListRef.current) {
      const activeMove = moveListRef.current.querySelector('[data-active="true"]');
      if (activeMove) {
        activeMove.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentPly]);

  // Reset ply when switching games
  useEffect(() => {
    setCurrentPly(0);
    setIsPlaying(false);
  }, [selectedGameIndex]);

  // Handle Playback
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && currentPly < history.length) {
      interval = setInterval(() => {
        setCurrentPly((prev) => prev + 1);
      }, playbackSpeed);
    } else if (currentPly >= history.length) {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentPly, history.length, playbackSpeed]);

  const boardState = useMemo(() => {
    const tempChess = new Chess();
    for (let i = 0; i < currentPly; i++) {
      tempChess.move(history[i]);
    }
    return tempChess.board();
  }, [currentPly, history]);

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
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto min-h-[700px]">
      {/* Game Selector Tabs */}
      {gamesList.length > 1 && (
        <div className="flex gap-1 bg-white/[0.02] p-1 border border-white/5 rounded-lg w-fit">
          {gamesList.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedGameIndex(idx)}
              className={`px-4 py-2 text-[10px] technical-label uppercase tracking-widest transition-all rounded-md ${
                selectedGameIndex === idx 
                  ? 'bg-white/10 text-white shadow-inner' 
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              Game {idx + 1}
            </button>
          ))}
        </div>
      )}

      {/* Main Dual-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 flex-1">
        
        {/* Left Pane: Board & Primary Controls */}
        <div className="flex flex-col gap-4">
          <div className="aspect-square relative w-full bg-[#0a0a0a] border border-white/5 soft-shadow overflow-hidden rounded-xl group">
             <Canvas 
                shadows
                onCreated={({ gl }) => {
                  gl.shadowMap.type = 1; // PCFShadowMap
                }}
                gl={{ antialias: true, alpha: true }}
              >
                <PerspectiveCamera makeDefault position={[0, 10, 8]} fov={35} />
                <ambientLight intensity={1.5} />
                <pointLight position={[10, 10, 10]} intensity={2} castShadow />
                <spotLight position={[-10, 10, 10]} angle={0.2} penumbra={1} intensity={2} castShadow />
                
                <PresentationControls
                  global
                  rotation={[0, 0, 0]}
                  polar={[-Math.PI / 10, Math.PI / 4]}
                  azimuth={[-Math.PI / 4, Math.PI / 4]}
                >
                  <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
                     <Board3D />
                     {pieceComponents}
                     <ContactShadows position={[0, -0.01, 0]} opacity={0.6} scale={10} blur={2} far={1} />
                  </group>
                </PresentationControls>
                <Environment preset="studio" />
              </Canvas>

              {/* Status Overlay */}
              <div className="absolute bottom-6 left-6 technical-label px-4 py-2 bg-black/80 border border-white/10 backdrop-blur-xl rounded-lg text-[10px] flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${currentPly % 2 === 0 ? 'bg-white shadow-[0_0_8px_white]' : 'bg-white/20'}`} />
                <span className="opacity-40">Next:</span>
                <span className="font-bold tracking-widest uppercase">
                  {currentPly >= history.length ? 'Match Over' : (currentPly % 2 === 0 ? 'White to Move' : 'Black to Move')}
                </span>
              </div>
          </div>

          {/* Console Controls Bar */}
          <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-xl backdrop-blur-md">
            <div className="flex items-center gap-2">
              <button onClick={() => { setCurrentPly(0); setIsPlaying(false); }} className="p-3 hover:bg-white/10 rounded-lg transition-colors text-white/60"><RotateCcw size={18} /></button>
              <button onClick={() => setCurrentPly(Math.max(0, currentPly - 1))} className="p-3 hover:bg-white/10 rounded-lg transition-colors text-white/60"><ChevronLeft size={24} /></button>
              
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-14 h-14 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-all shadow-xl active:scale-95"
              >
                {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} className="ml-1" fill="currentColor" />}
              </button>

              <button onClick={() => setCurrentPly(Math.min(history.length, currentPly + 1))} className="p-3 hover:bg-white/10 rounded-lg transition-colors text-white/60"><ChevronRight size={24} /></button>
              <button onClick={() => { setCurrentPly(history.length); setIsPlaying(false); }} className="p-3 hover:bg-white/10 rounded-lg transition-colors text-white/60"><FastForward size={18} /></button>
            </div>

            <div className="flex items-center gap-6">
               <div className="flex flex-col items-end">
                  <span className="technical-label text-[8px] opacity-30 uppercase">Precision</span>
                  <select 
                    value={playbackSpeed} 
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="bg-transparent border-none text-[11px] font-bold technical-label cursor-pointer hover:text-white transition-colors outline-none"
                  >
                    <option value={2000}>0.5x</option>
                    <option value={1000}>1.0x</option>
                    <option value={500}>2.0x</option>
                    <option value={250}>4.0x</option>
                  </select>
               </div>
               <div className="h-8 w-px bg-white/5" />
               <div className="font-mono text-sm font-bold w-16 text-right tabular-nums opacity-60">
                 {currentPly}<span className="opacity-20 mx-1">/</span>{history.length}
               </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Pro Sidebar (Move List) */}
        <div className="flex flex-col bg-[#0d0d0d] border border-white/5 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="technical-label flex items-center gap-2">
              <HistoryIcon size={14} className="text-white/40" /> Move Notation
            </h3>
            {currentPly === history.length && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-accent/10 border border-accent/20 rounded text-[9px] font-bold text-accent uppercase tracking-tighter">
                <Trophy size={10} /> Result Final
              </span>
            )}
          </div>

          <div 
            ref={moveListRef}
            className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-2 custom-scrollbar"
          >
            <div className="flex flex-col gap-0.5">
              {pairedMoves.map((pair) => (
                <div key={pair.index} className="grid grid-cols-[40px_1fr_1fr] items-center text-[11px] technical-label">
                  <div className="py-2 text-center opacity-20 font-mono text-[9px]">{pair.index}.</div>
                  
                  {/* White Move */}
                  <button 
                    onClick={() => { setCurrentPly(pair.white.ply); setIsPlaying(false); }}
                    data-active={currentPly === pair.white.ply}
                    className={`py-2 px-3 text-left transition-all rounded-md ${
                      currentPly === pair.white.ply 
                        ? 'bg-white/10 text-white font-bold' 
                        : 'opacity-60 hover:opacity-100 hover:bg-white/[0.03]'
                    }`}
                  >
                    {pair.white.san}
                  </button>

                  {/* Black Move */}
                  {pair.black ? (
                    <button 
                      onClick={() => { setCurrentPly(pair.black!.ply); setIsPlaying(false); }}
                      data-active={currentPly === pair.black.ply}
                      className={`py-2 px-3 text-left transition-all rounded-md ${
                        currentPly === pair.black.ply 
                          ? 'bg-white/10 text-white font-bold' 
                          : 'opacity-60 hover:opacity-100 hover:bg-white/[0.03]'
                      }`}
                    >
                      {pair.black.san}
                    </button>
                  ) : <div />}
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Footer: Game Analysis Metadata */}
          <div className="p-6 bg-white/[0.02] border-t border-white/5 mt-auto">
             <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center text-[10px] technical-label">
                   <span className="opacity-40">Arena Protocol</span>
                   <span className="font-bold opacity-80 uppercase tracking-widest underline decoration-white/10 underline-offset-4">V3.High.Isolated</span>
                </div>
                <div className="h-px bg-white/5" />
                <p className="text-[10px] leading-relaxed text-white/30 italic">
                  Chess Engines executing in single-core sandboxes. No late-binding evaluation available.
                </p>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};
