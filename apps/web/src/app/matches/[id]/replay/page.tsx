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
  
  // Fetch PGN and Match details on the server
  const [pgnResult, match] = await Promise.all([
    getMatchPgnAction(id),
    ApiClient.getMatch(id)
  ]);

  if (!pgnResult.success || !pgnResult.pgn) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 bg-red-500/10 rounded-full">
              <ChevronLeft className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Replay Unavailable</h1>
          <p className="text-muted text-sm leading-relaxed">
            {pgnResult.error || "The PGN data for this match could not be found or parsed."}
          </p>
          <Link 
            href={`/matches/${id}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-foreground text-background font-bold text-sm tracking-tight hover:opacity-90 transition-all rounded-lg"
          >
            <ChevronLeft size={16} />
            Back to Match
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#050505] text-white z-[60] overflow-y-auto custom-scrollbar">
      {/* Immersive Header - NO BLUR/GRADIENT MUDDINESS */}
      <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <Link 
            href={`/matches/${id}`}
            className="p-2 hover:bg-white/5 transition-colors rounded-lg group"
          >
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-tight">
              {match.challengerEngine.name} vs {match.defenderEngine.name}
            </h1>
            <div className="flex items-center gap-2">
               <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
               <span className="technical-label text-[9px] opacity-40 uppercase tracking-widest">
                 Live Theater Mode
               </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
                <span className="text-xl font-mono font-bold tracking-tighter">
                    {match.challengerScore} - {match.defenderScore}
                </span>
                <span className="technical-label text-[8px] opacity-30 uppercase">Match Score</span>
            </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-8 lg:p-12">
        <ReplayController pgn={pgnResult.pgn} />
      </div>
      
      {/* Ambient backgrounds */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
