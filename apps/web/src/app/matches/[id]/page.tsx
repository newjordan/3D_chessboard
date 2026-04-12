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
  Clock,
  Swords
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

  const challengerWins = match.games.filter((g: any) => 
    (g.whiteEngineId === match.challengerEngineId && g.result === '1-0') ||
    (g.blackEngineId === match.challengerEngineId && g.result === '0-1')
  ).length;

  const defenderWins = match.games.filter((g: any) => 
    (g.whiteEngineId === match.defenderEngineId && g.result === '1-0') ||
    (g.blackEngineId === match.defenderEngineId && g.result === '0-1')
  ).length;

  const draws = match.games.filter((g: any) => g.result === '1/2-1/2').length;

  return (
    <div className="h-[calc(100vh-theme(spacing.16))] flex flex-col bg-background overflow-hidden overflow-x-hidden">
      
      {/* 1. Large "Arena" Scorecard Header */}
      <div className="flex-none border-b border-border-custom bg-white/[0.01] relative">
        <div className="container mx-auto max-w-7xl px-6 py-10">
          <div className="flex flex-col gap-8">
            
            {/* Top Bar: Nav & Meta */}
            <div className="flex items-center justify-between">
              <Link href="/leaderboard" className="technical-label flex items-center gap-2 hover:text-accent transition-colors">
                <ArrowLeft size={12} /> Back to Ladder
              </Link>
              <div className="flex items-center gap-6 technical-label text-[10px] opacity-40 uppercase tracking-widest">
                <span className="flex items-center gap-1.5"><Calendar size={10} /> {match.completedAt ? new Date(match.completedAt).toLocaleDateString() : 'Live'}</span>
                <span className="flex items-center gap-1.5"><Clock size={10} /> Blitz · 40/60s</span>
                <span className="flex items-center gap-1.5 text-accent font-bold italic"><Activity size={10} /> {match.status}</span>
              </div>
            </div>

            {/* Main Score Block */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-12 lg:gap-24">
              
              {/* Challenger */}
              <div className="flex flex-col items-end gap-4">
                <div className="flex flex-col items-end">
                  <Link href={`/engines/${match.challengerEngine.slug}`} className="text-4xl lg:text-5xl font-bold tracking-tighter hover:text-accent transition-colors text-right">
                    {match.challengerEngine.name}
                  </Link>
                  <Link 
                    href={`/users/${match.challengerEngine.owner.username}`}
                    className="flex items-center gap-2 mt-1 hover:opacity-100 transition-opacity group/owner"
                  >
                    <span className="technical-label text-xs opacity-40 group-hover/owner:text-accent group-hover/owner:opacity-100 transition-all font-bold">@{match.challengerEngine.owner.username}</span>
                    {match.challengerEngine.owner.image && (
                      <img src={match.challengerEngine.owner.image} className="w-4 h-4 rounded-full border border-white/5 group-hover/owner:border-accent/40" alt="" />
                    )}
                  </Link>
                </div>
                <div className="flex gap-2 font-mono text-[10px] opacity-40">
                  <span>ELO {match.challengerEngine.currentRating}</span>
                </div>
              </div>

              {/* The Score */}
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-10 px-10 py-6 bg-white/[0.03] border border-white/10 rounded-2xl shadow-2xl relative overflow-hidden">
                   <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none" />
                   <span className={`text-6xl lg:text-7xl font-mono font-black tracking-tighter ${Number(match.challengerScore) > Number(match.defenderScore) ? 'text-accent' : 'opacity-80'}`}>
                     {match.challengerScore?.toString()}
                   </span>
                   <div className="flex flex-col items-center gap-2">
                      <div className="w-px h-6 bg-white/10" />
                      <Swords size={20} className="opacity-20 translate-y-0.5" />
                      <div className="w-px h-6 bg-white/10" />
                   </div>
                   <span className={`text-6xl lg:text-7xl font-mono font-black tracking-tighter ${Number(match.defenderScore) > Number(match.challengerScore) ? 'text-accent' : 'opacity-80'}`}>
                     {match.defenderScore?.toString()}
                   </span>
                </div>
                <div className="flex gap-4 technical-label text-[10px] opacity-40 uppercase font-bold">
                  <span>{challengerWins}W</span>
                  <span>{draws}D</span>
                  <span>{defenderWins}W</span>
                </div>
              </div>

              {/* Defender */}
              <div className="flex flex-col items-start gap-4">
                <div className="flex flex-col items-start">
                  <Link href={`/engines/${match.defenderEngine.slug}`} className="text-4xl lg:text-5xl font-bold tracking-tighter hover:text-accent transition-colors">
                    {match.defenderEngine.name}
                  </Link>
                  <Link 
                    href={`/users/${match.defenderEngine.owner.username}`}
                    className="flex items-center gap-2 mt-1 hover:opacity-100 transition-opacity group/owner"
                  >
                    {match.defenderEngine.owner.image && (
                      <img src={match.defenderEngine.owner.image} className="w-4 h-4 rounded-full border border-white/5 group-hover/owner:border-accent/40" alt="" />
                    )}
                    <span className="technical-label text-xs opacity-40 group-hover/owner:text-accent group-hover/owner:opacity-100 transition-all font-bold">@{match.defenderEngine.owner.username}</span>
                  </Link>
                </div>
                <div className="flex gap-2 font-mono text-[10px] opacity-40">
                  <span>ELO {match.defenderEngine.currentRating}</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Game Feed Area */}
      <div className="flex-1 flex flex-col min-h-0 bg-black/20">
        <div className="container mx-auto max-w-7xl px-6 flex flex-col h-full">
          
          <div className="flex items-center justify-between py-6 border-b border-border-custom">
            <h2 className="technical-label flex items-center gap-2 opacity-60">
              <Zap size={14} className="text-accent" /> Match Transactions ({match.games.length})
            </h2>
            <div className="flex items-center gap-8">
               <div className="flex items-center gap-6 technical-label text-[10px] opacity-20 mr-6">
                  <span className="flex items-center gap-2"><ShieldCheck size={12} /> SHA-256 Validated</span>
                  <span className="flex items-center gap-2"><FileText size={12} /> PGN Logs Ready</span>
               </div>
               <ReplayButton matchId={match.id} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
            {match.games.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-20 opacity-20 text-center gap-4">
                <Clock size={48} className="animate-pulse" />
                <p className="technical-label text-sm">Synchronizing game plies...</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {match.games.map((game: any, idx: number) => {
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
                    <div key={game.id} className="grid grid-cols-[80px_1fr_120px] items-center py-6 border-b border-white/[0.03] hover:bg-white/[0.01] transition-colors group px-4">
                      <span className="font-mono text-xs opacity-20">#{String(idx + 1).padStart(2, '0')}</span>
                      
                      <div className="flex items-center gap-12">
                         <div className="flex items-center gap-4 min-w-[200px]">
                            <div className={`w-3 h-3 rounded-full ${isChallengerWhite ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'bg-neutral-800'}`} />
                            <span className={`text-sm font-medium tracking-tight ${challengerPoint > defenderPoint ? 'text-accent' : 'opacity-60'}`}>
                              {match.challengerEngine.name}
                            </span>
                         </div>
                         
                         <span className="opacity-10 technical-label text-[9px] italic">vs</span>

                         <div className="flex items-center gap-4 min-w-[200px]">
                            <div className={`w-3 h-3 rounded-full ${!isChallengerWhite ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'bg-neutral-800'}`} />
                            <span className={`text-sm font-medium tracking-tight ${defenderPoint > challengerPoint ? 'text-accent' : 'opacity-60'}`}>
                              {match.defenderEngine.name}
                            </span>
                         </div>
                      </div>

                      <div className="flex flex-col items-end">
                         <div className="flex items-center gap-3 font-mono text-sm font-black tabular-nums">
                            <span className={challengerPoint > defenderPoint ? 'text-accent' : (challengerPoint < defenderPoint ? 'text-red-900' : 'opacity-40')}>{challengerPoint}</span>
                            <span className="opacity-10">-</span>
                            <span className={defenderPoint > challengerPoint ? 'text-accent' : (defenderPoint < challengerPoint ? 'text-red-900' : 'opacity-40')}>{defenderPoint}</span>
                         </div>
                         <span className="technical-label text-[8px] opacity-20 uppercase tracking-tighter mt-1">{game.termination || 'Normal'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
