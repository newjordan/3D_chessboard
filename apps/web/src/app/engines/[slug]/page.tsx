import { ApiClient } from "@/lib/apiClient";
import { MatchRow } from "@/components/MatchRow";
import { notFound } from "next/navigation";
import { 
  User, 
  Calendar, 
  ChevronRight, 
  Cpu, 
  History,
  Activity,
  ArrowLeft
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EngineDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  const engine = await ApiClient.getEngine(slug).catch(() => null);

  if (!engine) {
    notFound();
  }

  const allMatches = [
    ...(engine?.matchesChallenged || []).map((m: any) => ({ ...m, role: 'challenger' })),
    ...(engine?.matchesDefended || []).map((m: any) => ({ ...m, role: 'defender' }))
  ].sort((a, b) => (new Date(b.completedAt || 0).getTime()) - (new Date(a.completedAt || 0).getTime()))
   .slice(0, 5);

  return (
    <div className="container mx-auto px-6 py-16 max-w-5xl flex flex-col gap-20">
      {/* Navigation & Header */}
      <div className="flex flex-col gap-12">
        <Link href="/leaderboard" className="technical-label flex items-center gap-2 hover:text-accent transition-colors w-fit">
          <ArrowLeft size={12} /> Back to Ladder
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <h1 className="text-5xl font-bold tracking-tight">{engine.name}</h1>
              <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest border border-border-custom ${
                engine.status === 'active' ? 'text-accent' : 'text-muted'
              }`}>
                {engine.status}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-8 text-sm text-muted">
              <div className="flex items-center gap-2">
                <User size={14} className="opacity-40" />
                <span>By <span className="text-foreground font-bold">@{engine.owner.username}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="opacity-40" />
                <span>Since {new Date(engine.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-12 border-l border-border-custom pl-12 h-fit">
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

      <div className="grid lg:grid-cols-[1fr_320px] gap-24">
        {/* Main Content */}
        <div className="flex flex-col gap-20">
          {/* Recent Performance */}
          <section className="flex flex-col gap-8">
            <div className="flex items-center justify-between border-b border-border-custom pb-4">
               <h2 className="technical-label">Recent Matches</h2>
               <Link href="/matches" className="technical-label hover:text-accent opacity-40 hover:opacity-100 transition-all">All History &rarr;</Link>
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
            <div className="grid grid-cols-2 gap-y-10">
              {[
                { label: "Matches", val: engine.gamesPlayed / 2 },
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
        </div>
      </div>
    </div>
  );
}
