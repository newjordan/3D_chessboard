import { ApiClient } from "@/lib/apiClient";
import { notFound } from "next/navigation";
import { 
  Trophy, 
  User, 
  Calendar, 
  ChevronRight, 
  Cpu, 
  Hash, 
  History,
  Activity
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
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col gap-12">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="flex flex-col gap-6">
            <nav className="flex items-center gap-2 text-sm text-white/40">
              <Link href="/leaderboard" className="hover:text-accent transition-colors">Leaderboard</Link>
              <ChevronRight size={14} />
              <span className="text-white/60">Engine Detail</span>
            </nav>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4">
                <h1 className="text-6xl font-extrabold tracking-tight">{engine.name}</h1>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                  engine.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                }`}>
                  {engine.status}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-white/60">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-accent" />
                  <span>By <span className="text-white font-medium">@{engine.owner.username}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-accent" />
                  <span>Created {new Date(engine.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="glass p-8 rounded-3xl border border-white/5 flex gap-10">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-widest text-white/40">Current Rating</span>
              <span className="text-4xl font-mono font-bold gold-gradient">{engine.currentRating}</span>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-widest text-white/40">Global Rank</span>
              <span className="text-4xl font-mono font-bold">#{engine.currentRank || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-12">
          {/* Main Content: History & Stats */}
          <div className="lg:col-span-2 flex flex-col gap-10">
            {/* Version History */}
            <section className="flex flex-col gap-6">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <History className="text-accent" size={24} /> Version History
              </h2>
              <div className="glass rounded-3xl border border-white/5 overflow-hidden">
                <div className="p-4 bg-white/5 border-b border-white/5 grid grid-cols-4 text-xs font-bold uppercase tracking-widest text-white/40">
                  <span>Version</span>
                  <span>Validation</span>
                  <span>Submitted</span>
                  <span className="text-right">Size</span>
                </div>
                <div className="divide-y divide-white/5">
                  {(engine.versions || []).map((version: any) => (
                    <div key={version.id} className="p-4 grid grid-cols-4 items-center">
                      <div className="flex flex-col">
                        <span className="font-bold">{version.uciName || "Processing..."}</span>
                        <span className="text-[10px] font-mono text-white/40 truncate">{version.sha256.substring(0, 12)}</span>
                      </div>
                      <div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          version.validationStatus === 'passed' ? 'text-green-400 border-green-400/20 bg-green-400/5' : 'text-yellow-500 border-yellow-500/20 bg-yellow-500/5'
                        }`}>
                          {version.validationStatus}
                        </span>
                      </div>
                      <span className="text-sm text-white/50">{new Date(version.submittedAt).toLocaleDateString()}</span>
                      <span className="text-sm text-white/50 text-right font-mono">{(version.fileSizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Recent Matches */}
            <section className="flex flex-col gap-6">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Activity className="text-accent" size={24} /> Recent Matches
              </h2>
              <div className="flex flex-col gap-4">
                {allMatches.map((match) => (
                  <Link 
                    key={match.id}
                    href={`/matches/${match.id}`}
                    className="glass p-6 rounded-2xl border border-white/5 hover:border-accent/20 transition-all flex flex-col md:flex-row items-center justify-between gap-6 group"
                  >
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{match.matchType}</span>
                        <span className="text-xs font-mono text-white/60">{new Date(match.completedAt || 0).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-bold ${match.role === 'challenger' ? 'text-accent' : ''}`}>{engine.name}</span>
                        <span className="text-white/20 font-bold italic">VS</span>
                        <span className="font-bold">{(match as any).defenderEngine?.name || (match as any).challengerEngine?.name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="flex items-center gap-2 text-xl font-mono font-bold">
                        <span className={Number(match.challengerScore) > Number(match.defenderScore) ? 'text-green-400' : 'text-white/60'}>
                          {match.role === 'challenger' ? match.challengerScore?.toString() : match.defenderScore?.toString()}
                        </span>
                        <span className="text-white/10">-</span>
                        <span className={Number(match.defenderScore) > Number(match.challengerScore) ? 'text-green-400' : 'text-white/60'}>
                          {match.role === 'challenger' ? match.defenderScore?.toString() : match.challengerScore?.toString()}
                        </span>
                      </div>
                      <ChevronRight className="text-white/20 group-hover:text-accent transition-colors" />
                    </div>
                  </Link>
                ))}
                {allMatches.length === 0 && (
                  <div className="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center gap-4 text-white/40">
                    <Activity size={32} className="opacity-20" />
                    <p>No official matches played yet.</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar: Profile & Performance */}
          <div className="flex flex-col gap-8">
            <div className="glass p-8 rounded-[2rem] border border-white/5 flex flex-col gap-8">
              <h3 className="font-bold flex items-center gap-2">
                <Cpu size={18} className="text-accent" /> Engine Stats
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Games Played</span>
                  <span className="text-2xl font-mono font-bold">{engine.gamesPlayed}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Win Rate</span>
                  <span className="text-2xl font-mono font-bold">
                    {engine.gamesPlayed > 0 ? ((engine.wins / engine.gamesPlayed) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Draw Rate</span>
                  <span className="text-2xl font-mono font-bold">
                    {engine.gamesPlayed > 0 ? ((engine.draws / engine.gamesPlayed) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Loss Rate</span>
                  <span className="text-2xl font-mono font-bold">
                    {engine.gamesPlayed > 0 ? ((engine.losses / engine.gamesPlayed) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>

              <div className="h-px bg-white/5" />

              <div className="flex flex-col gap-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Hash size={18} className="text-accent" /> Current Build
                </h3>
                <div className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 text-[11px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-white/40">Arch:</span>
                    <span className="text-white/80">x86_64 Linux</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/40">Handshake:</span>
                    <span className="text-green-400">Passed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
