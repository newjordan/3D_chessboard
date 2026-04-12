"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Zap, Trophy, ArrowRight } from 'lucide-react';
import { Board2D } from '../replay/Board2D';
import { ApiClient } from '@/lib/apiClient';
import Link from 'next/link';

export function ShowcaseReplay() {
  const [match, setMatch] = useState<any>(null);
  const [pgn, setPgn] = useState<string>("");
  const [currentPly, setCurrentPly] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch random match on mount
  useEffect(() => {
    const fetchRandomMatch = async () => {
      try {
        const random = await ApiClient.getRandomMatch();
        if (random) {
          setMatch(random);
          const matchPgn = await ApiClient.getMatchPgn(random.id);
          if (matchPgn) setPgn(matchPgn);
        }
      } catch (e) {
        console.error("Failed to fetch showcase match", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRandomMatch();
  }, []);

  // 2. Process PGN into history (first game only for showcase)
  useEffect(() => {
    if (!pgn) return;
    const games = pgn.split(/\[Event /g).filter(s => s.trim().length > 0).map(s => `[Event ${s.trim()}`);
    const firstGame = games.find(s => /\d+\.\s/.test(s));
    if (firstGame) {
      const chess = new Chess();
      try {
        const cleanPgn = firstGame.replace(/(1-0|0-1|1\/2-1\/2)$/, '').trim();
        chess.loadPgn(cleanPgn);
        setHistory(chess.history({ verbose: true }));
      } catch (e) {
        setHistory([]);
      }
    }
  }, [pgn]);

  // 3. Playback Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && currentPly < history.length) {
      interval = setInterval(() => setCurrentPly(prev => prev + 1), 1500);
    } else if (currentPly >= history.length) {
      setIsPlaying(false);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentPly, history.length]);

  const boardState = useMemo(() => {
    const tempChess = new Chess();
    for (let i = 0; i < currentPly; i++) tempChess.move(history[i]);
    return tempChess.board();
  }, [currentPly, history]);

  const lastMove = useMemo(() => {
    if (currentPly === 0 || !history[currentPly - 1]) return null;
    const move = history[currentPly - 1];
    return { from: move.from as string, to: move.to as string };
  }, [currentPly, history]);

  if (isLoading) return (
    <div className="w-full aspect-[16/9] bg-white/[0.02] border border-border-custom rounded-2xl flex items-center justify-center">
      <div className="technical-label opacity-20 animate-pulse">Synchronizing Arena Stream...</div>
    </div>
  );

  if (!match) return null;

  return (
    <div className="group relative w-full bg-white/[0.01] border border-border-custom rounded-2xl overflow-hidden soft-shadow">
      <div className="grid lg:grid-cols-[1fr_400px] h-full">
        
        {/* Left: The Board */}
        <div className="p-8 lg:p-12 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-[440px] aspect-square relative">
            <Board2D board={boardState as any} lastMove={lastMove} />
            
            {/* Minimal Board Overlays */}
            <div className="absolute top-4 left-4 flex flex-col gap-1">
               <div className="technical-label text-[8px] opacity-40 uppercase">Recent Encounter</div>
               <div className="px-3 py-1.5 bg-black/80 backdrop-blur-md border border-white/10 rounded-md flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                 <span className="font-bold text-[11px] tracking-tight whitespace-nowrap">{match.challengerEngine.name} vs {match.defenderEngine.name}</span>
               </div>
            </div>
          </div>
        </div>

        {/* Right: Technical Context & Controls */}
        <div className="p-8 lg:p-10 border-l border-border-custom flex flex-col justify-between bg-white/[0.01]">
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <span className="technical-label text-accent flex items-center gap-2">
                <Zap size={12} fill="currentColor" /> Live Arena Feed
              </span>
              <span className="font-mono text-[10px] opacity-20">TRANS_ID: {match.id.substring(0,8)}</span>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="text-2xl font-bold tracking-tight">Proof of Result</h3>
              <p className="text-sm text-muted leading-relaxed">
                Matches are computed in isolated sandboxes. This encounter between <span className="text-foreground font-bold">{match.challengerEngine.name}</span> and <span className="text-foreground font-bold">{match.defenderEngine.name}</span> concluded with a score of <span className="text-accent font-mono font-bold">{match.challengerScore}-{match.defenderScore}</span>.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center technical-label text-[9px] opacity-40 uppercase tracking-widest">
                <span>Playback Progress</span>
                <span>{currentPly} / {history.length} Plies</span>
              </div>
              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-300" 
                  style={{ width: `${(currentPly / history.length) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6 pt-12">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => { setCurrentPly(0); setIsPlaying(false); }}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/40"
              >
                <RotateCcw size={16} />
              </button>
              <button 
                onClick={() => { setCurrentPly(prev => Math.max(0, prev - 1)); setIsPlaying(false); }}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/60"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
              </button>
              <button 
                onClick={() => { setCurrentPly(prev => Math.min(history.length, prev + 1)); setIsPlaying(false); }}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/60"
              >
                <ChevronRight size={20} />
              </button>
              <Link 
                href={`/matches/${match.id}`}
                className="ml-auto flex items-center gap-2 technical-label text-[10px] hover:text-accent transition-colors"
              >
                Full Analysis <ArrowRight size={12} />
              </Link>
            </div>

            <div className="flex items-center gap-2 p-4 bg-accent/5 border border-accent/20 rounded-xl">
               <Trophy size={14} className="text-accent" />
               <span className="technical-label text-[10px] text-accent font-bold">Verified Tournament Outcome</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
