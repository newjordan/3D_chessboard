import { ApiClient } from "@/lib/apiClient";
import { MatchRow } from "@/components/MatchRow";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { 
  User, 
  Calendar, 
  ChevronRight, 
  Cpu, 
  History,
  Activity,
  ArrowLeft,
  AlertOctagon,
  ShieldAlert,
  Terminal
} from "lucide-react";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AgentManagement } from "@/components/engines/AgentManagement";
import { RatingHistogram } from "@/components/RatingHistogram";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const engine = await ApiClient.getEngine(slug).catch(() => null);
  
  if (!engine) return { title: "Agent Not Found" };

  return {
    title: `${engine.name} (Elo: ${engine.currentRating})`,
    description: `View performance data, match history, and technical specs for ${engine.name}, a competitive AI chess agent.`,
  };
}

export const dynamic = "force-dynamic";

export default async function EngineDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  
  const engine = await ApiClient.getEngine(slug).catch(() => null);

  if (!engine) {
    notFound();
  }

  const isOwner = (session?.user as any)?.id === engine.ownerUserId;
  const latestVersion = engine.versions?.[0];

  const allMatches = [
    ...(engine?.matchesChallenged || []).map((m: any) => ({ ...m, role: 'challenger' })),
    ...(engine?.matchesDefended || []).map((m: any) => ({ ...m, role: 'defender' }))
  ].sort((a, b) => (new Date(b.completedAt || 0).getTime()) - (new Date(a.completedAt || 0).getTime()))
   .slice(0, 5);

  const histogramData = await ApiClient.getRatingHistogram().catch(() => []);

  return (
    <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-16 max-w-5xl flex flex-col gap-12 sm:gap-20">
      {/* Navigation & Header */}
      <div className="flex flex-col gap-12">
        <Link href="/leaderboard" className="technical-label flex items-center gap-2 hover:text-accent transition-colors w-fit">
          <ArrowLeft size={12} /> Back to Ladder
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
          <div className="flex flex-col gap-6">
            {/* Build Failure Alert for Owner */}
            {isOwner && latestVersion?.validationStatus === 'failed' && (
              <div className="flex flex-col gap-4 p-6 bg-red-950/20 border border-red-900/40 rounded-xl animate-in fade-in slide-in-from-left-4">
                <div className="flex items-center gap-3 text-red-500">
                  <AlertOctagon size={20} />
                  <span className="technical-label font-bold text-xs uppercase tracking-widest">Build Pipeline Failed</span>
                </div>
                <div className="flex flex-col gap-2 bg-black/40 p-4 rounded border border-red-900/20">
                   <div className="flex items-center gap-2 technical-label text-[10px] opacity-40">
                      <Terminal size={10} /> validation_exception.log
                   </div>
                   <p className="font-mono text-[11px] text-red-200/80 leading-relaxed">
                     {latestVersion.validationNotes || "Unknown validation error encountered during sandbox probing."}
                   </p>
                </div>
                <Link href="/submit" className="text-[10px] technical-label text-accent hover:underline w-fit">
                   Modify Code & Re-upload &rarr;
                </Link>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">{engine.name}</h1>
              <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-border-custom ${
                engine.status === 'active' ? 'text-accent' : 'text-muted'
              }`}>
                {engine.status}
              </span>
              {(Number((engine as any)._count?.matchesChallenged || 0) + Number((engine as any)._count?.matchesDefended || 0)) > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                  <span className="text-[10px] font-bold text-accent uppercase tracking-tighter italic">In Arena</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 sm:gap-8 text-sm text-muted">
              <Link 
                href={`/users/${engine.owner.username || engine.owner.id}`}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity group/owner"
              >
                {engine.owner.image ? (
                  <img src={engine.owner.image} alt={engine.owner.username} className="w-6 h-6 rounded-full border border-white/10 shadow-sm group-hover/owner:border-accent/40" />
                ) : (
                  <User size={14} className="opacity-40 group-hover/owner:text-accent" />
                )}
                <span>By <span className="text-foreground font-bold group-hover/owner:text-accent transition-colors">@{engine.owner.username || engine.owner.id.substring(0, 8)}</span></span>
              </Link>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="opacity-40" />
                <span>Since {new Date(engine.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-8 sm:gap-12 border-t md:border-t-0 md:border-l border-border-custom pt-6 md:pt-0 md:pl-12 h-fit">
            <div className="flex flex-col gap-1">
              <span className="technical-label">Rating</span>
              <span className="text-3xl font-bold font-mono tracking-tighter">{engine.currentRating}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="technical-label">Global Rank</span>
              <span className="text-3xl font-bold font-mono tracking-tighter">#{engine.currentRank || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-12 sm:gap-24">
        {/* Main Content */}
        <div className="flex flex-col gap-20">
          {/* Recent Performance */}
          <section className="flex flex-col gap-8">
            <div className="flex items-center justify-between border-b border-border-custom pb-4">
               <h2 className="technical-label">Recent Matches</h2>
               <Link href={`/matches?engine=${engine.slug}`} className="technical-label hover:text-accent opacity-40 hover:opacity-100 transition-all">All History &rarr;</Link>
            </div>
            
            <div className="flex flex-col">
              {allMatches.map((match) => (
                <MatchRow key={match.id} match={match} engineName={engine.name} />
              ))}
              {allMatches.length === 0 && (
                <div className="py-20 text-center technical-label opacity-20 border-b border-border-custom">
                  Awaiting first match results.
                </div>
              )}
            </div>
          </section>

          {/* Build History */}
          <section className="flex flex-col gap-8">
            <h2 className="technical-label border-b border-border-custom pb-4">Build Pipeline</h2>
            <div className="flex flex-col gap-6">
              {(engine.versions || []).map((version: any) => (
                <div key={version.id} className="flex flex-col gap-3 p-6 border border-border-custom soft-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                       <span className="font-bold text-sm">
                         {version.uciName || version.versionLabel || (version.validationStatus === 'passed' ? 'Active Build' : 'Processing...')}
                       </span>
                       <span className="technical-label opacity-40 text-[9px] lowercase">{version.sha256.substring(0, 16)}</span>
                    </div>
                    <span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest border ${
                      version.validationStatus === 'passed' ? 'text-accent border-accent/20 bg-accent/5' : 'text-muted border-border-custom'
                    }`}>
                      {version.validationStatus}
                    </span>
                  </div>
                  <div className="flex items-center gap-6 pt-2">
                    <div className="flex items-center gap-1.5 technical-label text-[10px]">
                      <Calendar size={10} /> {new Date(version.submittedAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1.5 technical-label text-[10px]">
                      <History size={10} /> {(version.fileSizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-12">
          {/* Meta Stats */}
          <div className="flex flex-col gap-8 border border-border-custom p-8 soft-shadow bg-white/[0.01]">
            <h3 className="technical-label flex items-center gap-2">
              <Activity size={12} /> Performance Data
            </h3>
            
            <RatingHistogram data={histogramData} currentRating={engine.currentRating} />

            <div className="grid grid-cols-2 gap-y-10 border-t border-white/5 pt-8">
              {[
                { label: "Matches", val: (engine.gamesPlayed || 0) / 2 },
                { label: "Win %", val: engine.gamesPlayed > 0 ? ((engine.wins / engine.gamesPlayed) * 100).toFixed(1) + "%" : "0%" },
                { label: "Draw %", val: engine.gamesPlayed > 0 ? ((engine.draws / engine.gamesPlayed) * 100).toFixed(1) + "%" : "0%" },
                { label: "Loss %", val: engine.gamesPlayed > 0 ? ((engine.losses / engine.gamesPlayed) * 100).toFixed(1) + "%" : "0%" }
              ].map((stat, i) => (
                <div key={i} className="flex flex-col gap-1">
                   <span className="technical-label text-[9px] opacity-40">{stat.label}</span>
                   <span className="font-mono text-xl font-bold tabular-nums">{stat.val}</span>
                </div>
              ))}
            </div>
            
            <div className="border-t border-border-custom pt-8 flex flex-col gap-6">
              <h3 className="technical-label flex items-center gap-2">
                <Cpu size={12} /> Environment
              </h3>
              <div className="flex flex-col gap-4 text-[11px] font-mono opacity-60">
                <div className="flex justify-between">
                  <span>Architecture</span>
                  <span className="font-bold">x86_64</span>
                </div>
                <div className="flex justify-between">
                  <span>Language</span>
                  <span className="font-bold uppercase">{engine.versions?.[0]?.language || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sandbox</span>
                  <span className="font-bold text-accent">Isolated</span>
                </div>
              </div>
            </div>
          </div>

          {/* Management Tools - Owner Only & ONLY IF FAILED */}
          {isOwner && latestVersion?.validationStatus === 'failed' && (
            <div className="flex flex-col gap-6 p-8 border border-red-900/10 bg-red-950/[0.02] shadow-sm">
              <h3 className="technical-label flex items-center gap-2 text-red-500/80">
                <ShieldAlert size={12} /> Command Console
              </h3>
              <AgentManagement engineId={engine.id} userId={(session?.user as any)?.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
