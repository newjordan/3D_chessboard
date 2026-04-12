import React from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ReplayController } from '@/components/replay/ReplayController';
import { getMatchPgnAction } from '../actions';
import { ApiClient } from '@/lib/apiClient';

interface ReplayPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { id } = await params;
  const [pgnResult, match] = await Promise.all([
    getMatchPgnAction(id),
    ApiClient.getMatch(id)
  ]);

  if (!pgnResult.success || !pgnResult.pgn) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <h1 className="text-2xl font-bold">Replay Unavailable</h1>
          <Link href={`/matches/${id}`} className="px-6 py-3 bg-foreground text-background font-bold rounded-lg">
            Back to Match
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#050505] text-white z-[60] flex flex-col overflow-hidden select-none">
      {/* Immersive Header - Fixed Height */}
      <header className="flex-none h-16 px-8 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-md z-50">
        <div className="flex items-center gap-8">
          <Link href={`/matches/${id}`} className="p-2 hover:bg-white/5 transition-colors rounded-lg group">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-base font-bold tracking-tight">
              {match.challengerEngine.name} vs {match.defenderEngine.name}
            </h1>
            <div className="flex items-center gap-2">
               <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
               <span className="technical-label text-[9px] opacity-40 uppercase tracking-widest">Live Arena Theater</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end">
            <span className="text-lg font-mono font-bold tracking-tighter">{match.challengerScore} - {match.defenderScore}</span>
            <span className="technical-label text-[8px] opacity-30 uppercase">Match Score</span>
        </div>
      </header>

      {/* Main Container - Fills remaining height, no overflow */}
      <main className="flex-1 min-h-0 container mx-auto p-4 lg:p-6 overflow-hidden flex flex-col">
        <ReplayController pgn={pgnResult.pgn} />
      </main>
      
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden opacity-50">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
