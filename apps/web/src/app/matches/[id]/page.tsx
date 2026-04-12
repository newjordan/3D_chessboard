import { ApiClient } from "@/lib/apiClient";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { 
  Trophy, 
  ChevronRight, 
  FileText, 
  Calendar, 
  Activity,
  ArrowLeft,
  ShieldCheck,
  Zap,
  Clock
} from "lucide-react";
import Link from "next/link";
import { ReplayButton } from "@/components/replay/ReplayButton";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const match = await ApiClient.getMatch(id).catch(() => null);
  
  if (!match) return { title: "Match Not Found" };

  return {
    title: `${match.challengerEngine.name} vs ${match.defenderEngine.name}`,
    description: `Match results and detailed game history for ${match.challengerEngine.name} vs ${match.defenderEngine.name}. Final Score: ${match.challengerScore} - ${match.defenderScore}.`,
  };
}

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const match = await ApiClient.getMatch(id).catch(() => null);

  if (!match) {
    notFound();
  }

  const winner = Number(match.challengerScore) > Number(match.defenderScore) 
    ? match.challengerEngine 
    : Number(match.defenderScore) > Number(match.challengerScore) 
      ? match.defenderEngine 
      : null;

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col overflow-hidden bg-background">
      {/* 1. Ultra-Compact Scorecard Header */}
      <div className="flex-none p-6 border-b border-border-custom bg-white/[0.01]">
        <div className="container mx-auto max-w-7xl flex items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <Link href="/leaderboard" className="p-2 hover:bg-white/5 transition-colors rounded-lg group">
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform opacity-40 hover:opacity-100" />
            </Link>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="technical-label text-[10px] opacity-40">Match Ledger</span>
                <span className="w-1 h-1 rounded-full bg-border-custom" />
                <span className="technical-label text-[10px] text-accent font-bold uppercase tracking-widest">{match.status}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight opacity-90">Transaction {match.id.substring(0, 8)}</h1>
            </div>
          </div>

          <div className="flex items-center gap-12">
            <div className="flex flex-col items-end gap-1">
              <Link href={`/engines/${match.challengerEngine.slug}`} className="text-lg font-bold hover:text-accent transition-colors leading-none">
                {match.challengerEngine.name}
              </Link>
              <div className="flex items-center gap-1.5 justify-end">
                <span className="technical-label text-[9px] opacity-40">@{match.challengerEngine.owner.username}</span>
                {match.challengerEngine.owner.image ? (
                  <img src={match.challengerEngine.owner.image} alt={match.challengerEngine.owner.username} className="w-3.5 h-3.5 rounded-full border border-white/5" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-white/5 border border-white/5" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 px-8 py-3 bg-white/[0.03] border border-white/10 rounded-xl shadow-inner">
               <span className={`text-4xl font-mono font-bold ${Number(match.challengerScore) > Number(match.defenderScore) ? 'text-accent' : 'opacity-80'}`}>
                 {match.challengerScore?.toString()}
               </span>
               <div className="flex flex-col items-center gap-2">
                  <div className="w-px h-4 bg-white/10" />
                  <span className="text-[10px] technical-label opacity-20 italic">VS</span>
                  <div className="w-px h-4 bg-white/10" />
               </div>
               <span className={`text-4xl font-mono font-bold ${Number(match.defenderScore) > Number(match.challengerScore) ? 'text-accent' : 'opacity-80'}`}>
                 {match.defenderScore?.toString()}
               </span>
            </div>

            <div className="flex flex-col items-start gap-1">
              <Link href={`/engines/${match.defenderEngine.slug}`} className="text-lg font-bold hover:text-accent transition-colors leading-none">
                {match.defenderEngine.name}
              </Link>
              <div className="flex items-center gap-1.5">
                {match.defenderEngine.owner.image ? (
                  <img src={match.defenderEngine.owner.image} alt={match.defenderEngine.owner.username} className="w-3.5 h-3.5 rounded-full border border-white/5" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-white/5 border border-white/5" />
                )}
                <span className="technical-label text-[9px] opacity-40">@{match.defenderEngine.owner.username}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
               <ReplayButton matchId={match.id} />
          </div>
        </div>
      </div>

      {/* 2. Main Analytics View (Split Pane) */}
      <div className="flex-1 min-h-0 flex container mx-auto max-w-7xl">
        
        {/* Left: Scrollable Game Feed */}
        <div className="flex-1 flex flex-col min-h-0 border-r border-border-custom">
            <div className="flex-none p-6 border-b border-border-custom bg-white/[0.01] flex items-center justify-between">
               <h2 className="technical-label flex items-center gap-2">
                 <Zap size={12} className="text-accent" /> Game ledger
               </h2>
               <span className="technical-label text-[10px] opacity-30 uppercase tracking-tighter">
                 {match.games.length} / {match.gamesPlanned} plies recorded
               </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {match.games.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-20 opacity-20 text-center gap-4">
                  <Clock size={32} />
                  <p className="technical-label">Processing game transactions...</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {match.games.map((game, idx) => {
                    const isChallengerWhite = game.whiteEngineId === match.challengerEngineId;
                    let challengerPoint = 0;
                    let defenderPoint = 0;
                    if (game.result === '1-0') {
                      if (isChallengerWhite) challengerPoint = 1; else defenderPoint = 1;
                    } else if (game.result === '0-1') {
                      if (isChallengerWhite) defenderPoint = 1; else challengerPoint = 1;
                    } else {
                      challengerPoint = 0.5; defenderPoint = 0.5;
                    }

                    return (
                      <div key={game.id} className="grid grid-cols-[80px_1fr_120px] items-center px-6 py-5 border-b border-border-custom hover:bg-white/[0.01] transition-colors group">
                        <span className="technical-label text-[10px] opacity-30 font-mono">#{String(idx + 1).padStart(2, '0')}</span>
                        
                        <div className="flex items-center gap-8">
                           <div className="flex items-center gap-3 min-w-[150px]">
                              <div className={`w-3.5 h-3.5 rounded-sm border ${isChallengerWhite ? 'bg-white border-white' : 'bg-neutral-900 border-white/20'}`} />
                              <span className={`text-[13px] tracking-tight ${challengerPoint > defenderPoint ? 'text-accent font-bold' : 'opacity-60'}`}>
                                {match.challengerEngine.name}
                              </span>
                           </div>
                           
                           <span className="opacity-10 text-[9px] font-mono">vs</span>

                           <div className="flex items-center gap-3 min-w-[150px]">
                              <div className={`w-3.5 h-3.5 rounded-sm border ${!isChallengerWhite ? 'bg-white border-white' : 'bg-neutral-900 border-white/20'}`} />
                              <span className={`text-[13px] tracking-tight ${defenderPoint > challengerPoint ? 'text-accent font-bold' : 'opacity-60'}`}>
                                {match.defenderEngine.name}
                              </span>
                           </div>
                        </div>

                        <div className="flex flex-col items-end gap-0.5">
                           <div className="flex items-center gap-2 font-mono text-xs font-bold tabular-nums">
                              <span className={challengerPoint > defenderPoint ? 'text-accent' : 'opacity-40'}>{challengerPoint}</span>
                              <span className="opacity-10">-</span>
                              <span className={defenderPoint > challengerPoint ? 'text-accent' : 'opacity-40'}>{defenderPoint}</span>
                           </div>
                           <span className="technical-label text-[8px] opacity-20 uppercase tracking-tighter truncate max-w-[100px]">{game.termination || 'Normal'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        </div>

        {/* Right: Technical Stats Sidebar */}
        <div className="w-[340px] flex-none flex flex-col min-h-0 bg-white/[0.01]">
            <div className="flex-none p-6 border-b border-border-custom">
               <h2 className="technical-label flex items-center gap-2">
                 <Activity size={12} className="opacity-40" /> Environment Data
               </h2>
            </div>
            
            <div className="flex-1 p-6 flex flex-col gap-10">
               <div className="flex flex-col gap-6">
                  {[
                    { label: "Completed At", icon: Calendar, val: match.completedAt ? new Date(match.completedAt).toLocaleString() : "Processing" },
                    { label: "Architecture", icon: ShieldCheck, val: "single-core isolated" },
                    { label: "Time Control", icon: Clock, val: "40 moves / 60 sec" }
                  ].map((item, i) => (
                    <div key={i} className="flex flex-col gap-2">
                       <div className="flex items-center gap-2 technical-label text-[9px] opacity-40 uppercase tracking-widest">
                          <item.icon size={10} /> {item.label}
                       </div>
                       <span className="text-[11px] font-bold font-mono text-foreground/80">{item.val}</span>
                    </div>
                  ))}
               </div>

               <div className="mt-auto p-6 bg-accent/5 border border-accent/20 rounded-xl flex flex-col gap-3">
                  <div className="flex items-center gap-2 technical-label text-accent text-[10px] font-bold">
                    <Trophy size={14} /> Result Verified
                  </div>
                  <p className="text-[10px] leading-relaxed opacity-60">
                    This match was computed on a high-audit standalone worker. Ratings have been adjusted according to Bayesian Elo logic.
                  </p>
               </div>
            </div>

            <div className="flex-none p-6 border-t border-border-custom">
               <div className="flex justify-between items-center text-[9px] technical-label opacity-20">
                  <span>Match Hash</span>
                  <span className="font-mono">{match.id.substring(match.id.length - 12)}</span>
               </div>
            </div>
        </div>
      </div>
    </div>
  );
}
