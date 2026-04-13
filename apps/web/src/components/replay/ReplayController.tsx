"use client";

import { Chess, Square } from 'chess.js';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Board3D } from './Board3D';
import { Piece3D } from './Piece3D';
import { Board2D } from './Board2D';
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw,
  FastForward,
  History as HistoryIcon,
  Box as BoxIcon,
  Maximize2
} from 'lucide-react';

interface ReplayControllerProps {
  pgn: string;
  whiteName?: string;
  blackName?: string;
  whitePieceUrl?: string;
  blackPieceUrl?: string;
}

export const ReplayController: React.FC<ReplayControllerProps> = ({ 
  pgn, 
  whiteName, 
  blackName,
  whitePieceUrl,
  blackPieceUrl
}) => {
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [currentPly, setCurrentPly] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const moveListRef = useRef<HTMLDivElement>(null);

  const gamesList = useMemo(() => {
    if (!pgn) return [];
    const segments = pgn.split(/\[Event /g)
                        .filter(s => s.trim().length > 0)
                        .map(s => `[Event ${s.trim()}`);
    return segments.filter(s => /\d+\.\s/.test(s));
  }, [pgn]);

  const currentGamePgn = useMemo(() => gamesList[selectedGameIndex] || "", [gamesList, selectedGameIndex]);

  const history = useMemo(() => {
    if (!currentGamePgn) return [];
    const tempChess = new Chess();
    try {
      const cleanPgn = currentGamePgn.replace(/(1-0|0-1|1\/2-1\/2)$/, '').trim();
      tempChess.loadPgn(cleanPgn);
      return tempChess.history({ verbose: true });
    } catch (e) {
      try { tempChess.loadPgn(currentGamePgn); return tempChess.history({ verbose: true }); }
      catch (i) { return []; }
    }
  }, [currentGamePgn]);

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

  useEffect(() => {
    if (moveListRef.current) {
      const activeMove = moveListRef.current.querySelector('[data-active="true"]');
      if (activeMove) activeMove.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentPly]);

  useEffect(() => {
    setCurrentPly(0);
    setIsPlaying(false);
  }, [selectedGameIndex]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && currentPly < history.length) {
      interval = setInterval(() => setCurrentPly((prev) => prev + 1), playbackSpeed);
    } else { setIsPlaying(false); }
    return () => clearInterval(interval);
  }, [isPlaying, currentPly, history.length, playbackSpeed]);

  const boardState = useMemo(() => {
    const tempChess = new Chess();
    for (let i = 0; i < currentPly; i++) tempChess.move(history[i]);
    return tempChess.board();
  }, [currentPly, history]);

  const lastMove = useMemo(() => {
    if (currentPly === 0) return null;
    const move = history[currentPly - 1];
    return { from: move.from as string, to: move.to as string };
  }, [currentPly, history]);

  const pieceComponents3D = useMemo(() => {
    if (viewMode !== '3D') return null;
    const pieces: React.ReactNode[] = [];
    boardState.forEach((row, r) => {
      row.forEach((square, c) => {
        if (square) {
          pieces.push(
            <Piece3D 
              key={`${square.type}-${square.color}-${r}-${c}`}
              type={square.type}
              color={square.color as 'w' | 'b'}
              position={[c - 3.5, 0, r - 3.5]}
            />
          );
        }
      });
    });
    return pieces;
  }, [boardState, viewMode]);

  const playerNames = useMemo(() => {
    return {
      white: whiteName || 'White AI',
      black: blackName || 'Black AI'
    };
  }, [whiteName, blackName]);

  return (
    <div className="flex flex-col gap-4 w-full h-full max-w-[1400px] mx-auto overflow-hidden">
      {/* Game Selector Tabs - Compact */}
      <div className="flex-none flex items-center justify-between">
        <div className="flex gap-1 bg-white/[0.02] p-1 border border-white/5 rounded-lg">
          {gamesList.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedGameIndex(idx)}
              className={`px-3 py-1.5 text-[9px] technical-label uppercase tracking-widest transition-all rounded-md ${
                selectedGameIndex === idx ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              Game {idx + 1}
            </button>
          ))}
        </div>

        {/* View Switcher */}
        <div className="flex gap-1 bg-white/[0.02] p-1 border border-white/5 rounded-lg">
          <button
            onClick={() => setViewMode('2D')}
            className={`flex items-center gap-2 px-3 py-1.5 text-[9px] technical-label uppercase tracking-widest transition-all rounded-md ${
              viewMode === '2D' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Maximize2 size={10} /> 2D View
          </button>
          <button
            onClick={() => setViewMode('3D')}
            className={`flex items-center gap-2 px-3 py-1.5 text-[9px] technical-label uppercase tracking-widest transition-all rounded-md ${
              viewMode === '3D' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <BoxIcon size={10} /> 3D Arena
          </button>
        </div>
      </div>

      {/* Main Dual-Pane Layout - Locked Height */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        
        {/* Left Pane: Board & Primary Controls */}
        <div className="flex flex-col gap-4 min-h-0">
          <div className="flex-1 min-h-0 relative bg-black border border-white/5 rounded-xl group overflow-hidden flex items-center justify-center p-4">
             {viewMode === '3D' ? (
               <Canvas 
                  shadows
                  onCreated={({ gl }) => { 
                    gl.shadowMap.enabled = true;
                    gl.shadowMap.type = THREE.PCFShadowMap; 
                  }}
                  gl={{ antialias: true, alpha: false, stencil: false }}
                >
                  <PerspectiveCamera makeDefault position={[0, 8, 8]} fov={45} />
                  <OrbitControls 
                    enablePan={false}
                    maxPolarAngle={Math.PI / 2.1} 
                    minDistance={5}
                    maxDistance={15}
                  />
                  
                  <ambientLight intensity={1.5} />
                  <directionalLight 
                    position={[10, 10, 10]} 
                    intensity={2} 
                    castShadow 
                    shadow-mapSize={[1024, 1024]}
                  />
                  <pointLight position={[-10, 5, -10]} intensity={1} color="#3b82f6" />
                  
                  <group position={[0, 0, 0]}>
                     <Board3D />
                     {pieceComponents3D}
                     <ContactShadows 
                       position={[0, -0.05, 0]} 
                       opacity={0.4} 
                       scale={12} 
                       blur={1.5} 
                       far={0.8} 
                     />
                  </group>

                  <Environment preset="night" />
                </Canvas>
             ) : (
                <div className="w-full h-full max-w-[600px] aspect-square">
                  <Board2D 
                    board={boardState as any} 
                    lastMove={lastMove} 
                    whitePieceUrl={whitePieceUrl}
                    blackPieceUrl={blackPieceUrl}
                  />
                </div>
             )}

              {/* Player Labels */}
              <div className="absolute top-6 left-6 flex flex-col gap-1 items-start">
                <span className="text-[10px] technical-label opacity-40 uppercase tracking-tighter">Opponent</span>
                <div className="technical-label px-3 py-1.5 bg-black/80 border border-white/10 backdrop-blur-md rounded-md flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-sm border border-white/20 bg-[#999999] ${currentPly % 2 === 1 && currentPly < history.length ? 'ring-2 ring-accent ring-offset-1 ring-offset-black' : ''}`} />
                  <span className="font-bold text-xs">{playerNames.black}</span>
                  <span className="text-[9px] opacity-40 lowercase">Black</span>
                </div>
              </div>

              <div className="absolute bottom-6 right-6 flex flex-col gap-1 items-end">
                <div className="technical-label px-3 py-1.5 bg-black/80 border border-white/10 backdrop-blur-md rounded-md flex items-center gap-2">
                  <span className="text-[9px] opacity-40 lowercase">White</span>
                  <span className="font-bold text-xs">{playerNames.white}</span>
                  <span className={`w-2 h-2 rounded-sm border border-white/20 bg-white ${currentPly % 2 === 0 && currentPly < history.length ? 'ring-2 ring-accent ring-offset-1 ring-offset-black' : ''}`} />
                </div>
                <span className="text-[10px] technical-label opacity-40 uppercase tracking-tighter">Current Player</span>
              </div>
          </div>

          {/* Console Controls Bar - Fixed and Compact */}
          <div className="flex-none flex items-center justify-between p-3 bg-white/[0.03] border border-white/5 rounded-xl">
            <div className="flex items-center gap-1">
              <button onClick={() => { setCurrentPly(0); setIsPlaying(false); }} title="Reset" className="p-2 hover:bg-white/5 rounded transition-colors text-white/40"><RotateCcw size={16} /></button>
              <button onClick={() => setCurrentPly(Math.max(0, currentPly - 1))} title="Prev" className="p-2 hover:bg-white/5 rounded transition-colors text-white/60"><ChevronLeft size={20} /></button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-all shadow-xl active:scale-95 mx-1"
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
              </button>
              <button onClick={() => setCurrentPly(Math.min(history.length, currentPly + 1))} title="Next" className="p-2 hover:bg-white/5 rounded transition-colors text-white/60"><ChevronRight size={20} /></button>
              <button onClick={() => { setCurrentPly(history.length); setIsPlaying(false); }} title="End" className="p-2 hover:bg-white/5 rounded transition-colors text-white/40"><FastForward size={16} /></button>
            </div>

            <div className="flex items-center gap-4">
               <select 
                 value={playbackSpeed} 
                 onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                 className="bg-transparent border-none text-[10px] technical-label cursor-pointer hover:text-white transition-colors outline-none"
               >
                 <option value={2000}>0.5x</option>
                 <option value={1000}>1.0x</option>
                 <option value={500}>2.0x</option>
               </select>
               <div className="font-mono text-[11px] font-bold opacity-40">
                 {currentPly}<span className="opacity-20 mx-1">/</span>{history.length}
               </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Pro Sidebar (Move List) - Scrollable with locked height */}
        <div className="flex-none flex flex-col bg-[#0d0d0d] border border-white/5 rounded-xl overflow-hidden min-h-0 h-full">
          <div className="flex-none p-4 border-b border-white/5">
            <h3 className="technical-label flex items-center gap-2 text-[10px]">
              <HistoryIcon size={12} className="text-white/40" /> Move Notation
            </h3>
          </div>

          <div ref={moveListRef} className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <div className="flex flex-col gap-0.5">
              {pairedMoves.map((pair) => (
                <div key={pair.index} className="grid grid-cols-[35px_1fr_1fr] items-center text-[10px] technical-label">
                  <div className="py-1.5 text-center opacity-20 font-mono text-[8px]">{pair.index}.</div>
                  <button onClick={() => { setCurrentPly(pair.white.ply); setIsPlaying(false); }} data-active={currentPly === pair.white.ply}
                    className={`py-1.5 px-3 text-left transition-all rounded ${currentPly === pair.white.ply ? 'bg-white/10 text-white font-bold' : 'opacity-40 hover:opacity-100 hover:bg-white/[0.02]'}`}
                  > {pair.white.san} </button>
                  {pair.black && (
                    <button onClick={() => { setCurrentPly(pair.black!.ply); setIsPlaying(false); }} data-active={currentPly === pair.black.ply}
                      className={`py-1.5 px-3 text-left transition-all rounded ${currentPly === pair.black.ply ? 'bg-white/10 text-white font-bold' : 'opacity-40 hover:opacity-100 hover:bg-white/[0.02]'}`}
                    > {pair.black.san} </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Footer - Static */}
          <div className="flex-none p-4 bg-white/[0.01] border-t border-white/5">
                <div className="flex justify-between items-center text-[9px] technical-label opacity-40">
                   <span>Isolation Level</span>
                   <span className="font-bold uppercase tracking-widest text-accent/60">High Performance</span>
                </div>
          </div>
        </div>

      </div>
    </div>
  );
};
