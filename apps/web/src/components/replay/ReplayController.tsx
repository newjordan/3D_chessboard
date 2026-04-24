"use client";

import { Chess } from 'chess.js';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Board3DScene } from './Board3DScene';
import type { Board3DHandle } from './board3d/types';
import { BOARD3D_CAPTURE_DURATION_MS, BOARD3D_MOVE_DURATION_MS } from './board3d/constants';
import { Board2D } from './Board2D';
import { 
  Play, 
  Pause, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw,
  FastForward,
  Box as BoxIcon,
  Maximize2
} from 'lucide-react';

interface ReplayControllerProps {
  pgn: string;
  whiteName?: string;
  blackName?: string;
  whitePieceUrl?: string;
  blackPieceUrl?: string;
  initialViewMode?: '2D' | '3D';
  initialPly?: number;
}

export const ReplayController: React.FC<ReplayControllerProps> = ({ 
  pgn, 
  whiteName, 
  blackName,
  whitePieceUrl,
  blackPieceUrl,
  initialViewMode = '2D',
  initialPly = 0,
}) => {
  const [selectedGameIndex, setSelectedGameIndex] = useState(0);
  const [currentPly, setCurrentPly] = useState(initialPly);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>(initialViewMode);
  const [flashTargetSquare, setFlashTargetSquare] = useState('e5');
  const board3dRef = useRef<Board3DHandle>(null);
  const prevPlyRef = useRef(0);
  const speedOptions = [1, 2, 3, 4] as const;
  const effectivePlaybackRate = playbackRate;

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

  useEffect(() => {
    setCurrentPly(selectedGameIndex === 0 ? initialPly : 0);
    setIsPlaying(false);
  }, [selectedGameIndex, initialPly]);

  // Sync 3D board when ply changes
  useEffect(() => {
    if (viewMode !== '3D' || !board3dRef.current) return;
    const prev = prevPlyRef.current;
    prevPlyRef.current = currentPly;

    if (currentPly === prev + 1 && currentPly > 0) {
      const move = history[currentPly - 1];
      board3dRef.current.applyMove(
        move.from,
        move.to,
        !!move.captured,
        move.flags ?? '',
        move.promotion ?? undefined,
        effectivePlaybackRate
      );
    } else {
      const temp = new Chess();
      for (let i = 0; i < currentPly; i++) temp.move(history[i]);
      board3dRef.current.resetToPosition(temp.fen());
    }
  }, [currentPly, viewMode, history, effectivePlaybackRate]);

  // Sync 3D board when switching to 3D view
  useEffect(() => {
    if (viewMode !== '3D' || !board3dRef.current) return;
    prevPlyRef.current = currentPly;
    const temp = new Chess();
    for (let i = 0; i < currentPly; i++) temp.move(history[i]);
    board3dRef.current.resetToPosition(temp.fen());
  }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isPlaying) {
      if (currentPly < history.length) {
        const nextMove = history[currentPly];
        const rate = effectivePlaybackRate;
        const requestedPlaybackMs = 1000 / rate;
        
        // Base delays that scale with playback rate
        const base2DDelay = (nextMove?.captured ? 2400 : 2200) / rate;
        const base3DDelay = (nextMove?.captured
          ? BOARD3D_CAPTURE_DURATION_MS
          : BOARD3D_MOVE_DURATION_MS) / rate;
        
        const restBeatMs = viewMode === '3D'
          ? 220 / Math.min(rate, 1.8)
          : 600 / rate;

        const effectivePlaybackSpeed = viewMode === '3D'
          ? Math.max(requestedPlaybackMs, base3DDelay) + restBeatMs
          : Math.max(requestedPlaybackMs, base2DDelay) + restBeatMs;

        interval = setInterval(() => {
          setCurrentPly((prev) => {
            if (prev >= history.length - 1) {
              setIsPlaying(false);
            }
            return Math.min(history.length, prev + 1);
          });
        }, effectivePlaybackSpeed);
      } else {
        setIsPlaying(false);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, currentPly, history, effectivePlaybackRate, viewMode]);

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

  const fxMove = useMemo(() => {
    if (currentPly === 0) return null;
    const move = history[currentPly - 1];
    return {
      from: move.from as string,
      to: move.to as string,
      flags: move.flags as string | undefined,
      captured: move.captured as string | undefined,
    };
  }, [currentPly, history]);

  const currentMoveLabel = useMemo(() => {
    if (currentPly === 0 || !history[currentPly - 1]) return 'START';
    const move = history[currentPly - 1];
    const moveNumber = Math.floor((currentPly - 1) / 2) + 1;
    const sidePrefix = currentPly % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
    return `${sidePrefix} ${move.san}`;
  }, [currentPly, history]);

  const playerNames = useMemo(() => {
    return {
      white: whiteName || 'White AI',
      black: blackName || 'Black AI'
    };
  }, [whiteName, blackName]);

  const triggerSquareFlash = () => {
    if (viewMode !== '3D' || !board3dRef.current) return;
    const normalized = flashTargetSquare.trim().toLowerCase();
    if (!/^[a-h][1-8]$/.test(normalized)) return;
    board3dRef.current.flashSquare(normalized);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          setCurrentPly((prev) => Math.max(0, prev - 1));
          setIsPlaying(false);
          break;
        case 'ArrowRight':
          setCurrentPly((prev) => Math.min(history.length, prev + 1));
          setIsPlaying(false);
          break;
        case ' ':
          e.preventDefault();
          setIsPlaying((prev) => !prev);
          break;
        case 'Home':
          setCurrentPly(0);
          setIsPlaying(false);
          break;
        case 'End':
          setCurrentPly(history.length);
          setIsPlaying(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history.length, isPlaying]);

  return (
    <div className="flex flex-col gap-4 w-full h-full max-w-[1660px] mx-auto overflow-hidden">
      {/* Game Selector Tabs - Compact */}
      <div className="flex-none flex items-center justify-between">
        <div className="flex gap-1 bg-white/[0.02] p-1 border border-white/5">
          {gamesList.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedGameIndex(idx)}
              className={`px-3 py-1.5 text-[9px] technical-label uppercase tracking-widest transition-all ${
                selectedGameIndex === idx ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              Game {idx + 1}
            </button>
          ))}
        </div>

        {/* View Switcher */}
        <div className="flex gap-1 bg-white/[0.02] p-1 border border-white/5">
          <button
            onClick={() => setViewMode('2D')}
            className={`flex items-center gap-2 px-3 py-1.5 text-[9px] technical-label uppercase tracking-widest transition-all ${
              viewMode === '2D' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Maximize2 size={10} /> 2D View
          </button>
          <button
            onClick={() => setViewMode('3D')}
            className={`flex items-center gap-2 px-3 py-1.5 text-[9px] technical-label uppercase tracking-widest transition-all ${
              viewMode === '3D' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <BoxIcon size={10} /> 3D Arena
          </button>
        </div>
      </div>

      {/* Main Board Layout - Locked Height */}
      <div className="flex-1 min-h-0 grid grid-cols-1">
        
        {/* Left Pane: Board & Primary Controls */}
        <div className="flex flex-col gap-4 min-h-0">
          <div className="flex-1 min-h-0 relative bg-black border border-white/5 group overflow-hidden flex items-center justify-center p-4">
             {viewMode === '3D' ? (
               <Board3DScene
                 ref={board3dRef}
                 whiteName={playerNames.white}
                 blackName={playerNames.black}
               />
             ) : (
                <div className="max-w-full aspect-square" style={{ width: 'min(100%, calc(100vh - 274px))' }}>
                  <Board2D 
                    board={boardState as any} 
                    lastMove={lastMove} 
                    whitePieceUrl={whitePieceUrl}
                    blackPieceUrl={blackPieceUrl}
                    fxMove={fxMove}
                    fxKey={currentPly}
                    fxSpeed={playbackRate}
                    moveLabel={currentMoveLabel}
                  />
                </div>
             )}

              {/* Player Labels */}
              {viewMode === '3D' && (
                <>
                  <div className="absolute top-6 left-6 flex flex-col gap-1 items-start">
                    <span className="text-[10px] technical-label opacity-40 uppercase tracking-tighter">Opponent</span>
                    <div className="technical-label px-3 py-1.5 bg-black/80 border border-white/10 backdrop-blur-md flex items-center gap-2">
                      <span className={`w-2 h-2 border border-white/20 bg-[#999999] ${currentPly % 2 === 1 && currentPly < history.length ? 'ring-2 ring-accent ring-offset-1 ring-offset-black' : ''}`} />
                      <span className="font-bold text-xs">{playerNames.black}</span>
                      <span className="text-[9px] opacity-40 lowercase">Black</span>
                    </div>
                  </div>

                  <div className="absolute bottom-6 right-6 flex flex-col gap-1 items-end">
                    <div className="technical-label px-3 py-1.5 bg-black/80 border border-white/10 backdrop-blur-md flex items-center gap-2">
                      <span className="text-[9px] opacity-40 lowercase">White</span>
                      <span className="font-bold text-xs">{playerNames.white}</span>
                      <span className={`w-2 h-2 border border-white/20 bg-white ${currentPly % 2 === 0 && currentPly < history.length ? 'ring-2 ring-accent ring-offset-1 ring-offset-black' : ''}`} />
                    </div>
                    <span className="text-[10px] technical-label opacity-40 uppercase tracking-tighter">Current Player</span>
                  </div>
                </>
              )}
          </div>

          {/* Console Controls Bar - Fixed and Compact */}
          <div className="flex-none flex items-center justify-between p-3 bg-white/[0.03] border border-white/5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => { setCurrentPly(0); setIsPlaying(false); }} 
                title="Reset (Home)" 
                className="p-2 hover:bg-white/5 transition-colors text-white/40 border border-transparent hover:border-white/10 active:bg-white/10"
              >
                <RotateCcw size={16} />
              </button>
              <button 
                onClick={() => { setCurrentPly(Math.max(0, currentPly - 1)); setIsPlaying(false); }} 
                title="Prev (Left)" 
                className="p-2 hover:bg-white/5 transition-colors text-white/60 border border-transparent hover:border-white/10 active:bg-white/10"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                title="Play/Pause (Space)"
                className="w-10 h-10 flex items-center justify-center bg-white text-black hover:scale-105 transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)] active:scale-95 mx-1 border border-white"
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
              </button>
              <button 
                onClick={() => { setCurrentPly(Math.min(history.length, currentPly + 1)); setIsPlaying(false); }} 
                title="Next (Right)" 
                className="p-2 hover:bg-white/5 transition-colors text-white/60 border border-transparent hover:border-white/10 active:bg-white/10"
              >
                <ChevronRight size={20} />
              </button>
              <button 
                onClick={() => { setCurrentPly(history.length); setIsPlaying(false); }} 
                title="End (End)" 
                className="p-2 hover:bg-white/5 transition-colors text-white/40 border border-transparent hover:border-white/10 active:bg-white/10"
              >
                <FastForward size={16} />
              </button>
            </div>

            <div className="hidden sm:flex min-w-0 flex-1 items-center justify-center px-4">
              <div className="technical-label flex min-w-[128px] items-center justify-center border border-white/5 bg-white/[0.025] px-4 py-2 text-[10px] uppercase tracking-widest text-white/70">
                <span className="mr-3 text-white/25">Move</span>
                <strong className="font-mono text-[12px] text-white">{currentMoveLabel}</strong>
              </div>
            </div>

            <div className="flex items-center gap-4">
               {viewMode === '3D' && (
                 <div className="flex items-center gap-1 bg-white/[0.02] border border-white/10 p-1">
                   <input
                     value={flashTargetSquare}
                     onChange={(e) => setFlashTargetSquare(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') triggerSquareFlash();
                     }}
                     placeholder="e5"
                     className="w-10 bg-transparent text-[10px] technical-label uppercase text-white/80 px-1.5 py-1 outline-none border border-white/10"
                   />
                   <button
                     onClick={triggerSquareFlash}
                     className="px-2 py-1 text-[9px] technical-label bg-[#8bddff]/15 text-[#c9f5ff] hover:bg-[#8bddff]/25 transition-colors"
                   >
                     Flash
                   </button>
                 </div>
               )}
               <div className="flex items-center gap-1 bg-white/[0.02] border border-white/5 p-1">
                 {speedOptions.map((speed) => (
                   <button
                     key={speed}
                     onClick={() => setPlaybackRate(speed)}
                     className={`px-2 py-1 text-[9px] technical-label transition-colors ${
                       playbackRate === speed
                         ? 'bg-white/15 text-white'
                         : 'bg-transparent text-white/45 hover:bg-white/10 hover:text-white'
                     }`}
                   >
                     {speed}x
                   </button>
                 ))}
               </div>
               <div className="font-mono text-[11px] font-bold opacity-40">
                 {currentPly}<span className="opacity-20 mx-1">/</span>{history.length}
               </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
