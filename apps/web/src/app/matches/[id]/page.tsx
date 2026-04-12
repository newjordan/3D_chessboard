import { ApiClient } from "@/lib/apiClient";
import { notFound } from "next/navigation";
import { 
  Trophy, 
  ChevronRight, 
  FileText, 
  Calendar, 
  Activity,
  ArrowLeft,
  ShieldCheck,
  Download
} from "lucide-react";
import Link from "next/link";

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
    <div className="container mx-auto px-6 py-16 max-w-5xl flex flex-col gap-20">
      {/* Navigation */}
      <Link href="/leaderboard" className="technical-label flex items-center gap-2 hover:text-accent transition-colors w-fit">
        <ArrowLeft size={12} /> Back to Ladder
      </Link>

      {/* Match Scorecard */}
      <section className="border border-border-custom p-12 md:p-20 soft-shadow flex flex-col gap-16 relative overflow-hidden">
        <div className="technical-label text-[10px] text-center opacity-40">Verification Hash: {match.id}</div>
        
        <div className="flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
          {/* Challenger */}
          <div className="flex flex-col items-center text-center gap-6 flex-1">
            <Link href={`/engines/${match.challengerEngine.slug}`} className="group flex flex-col items-center gap-4">
              <h2 className="text-3xl font-bold tracking-tight group-hover:underline">{match.challengerEngine.name}</h2>
              <span className="technical-label opacity-40 whitespace-nowrap">@{match.challengerEngine.owner.username}</span>
            </Link>
          </div>

          {/* VS / Score */}
          <div className="flex flex-col items-center gap-8">
            <div className="flex items-center gap-12">
              <span className="text-7xl font-bold font-mono tracking-tighter">{match.challengerScore?.toString()}</span>
              <div className="flex flex-col items-center gap-4">
                <div className="w-px h-8 bg-border-custom" />
                <span className="technical-label opacity-20">VS</span>
                <div className="w-px h-8 bg-border-custom" />
              </div>
              <span className="text-7xl font-bold font-mono tracking-tighter opacity-40">{match.defenderScore?.toString()}</span>
            </div>
            <span className="technical-label px-3 py-1 border border-accent/20 text-accent bg-accent/5">
              {match.status}
            </span>
          </div>

          {/* Defender */}
          <div className="flex flex-col items-center text-center gap-6 flex-1">
            <Link href={`/engines/${match.defenderEngine.slug}`} className="group flex flex-col items-center gap-4">
              <h2 className="text-3xl font-bold tracking-tight group-hover:underline">{match.defenderEngine.name}</h2>
              <span className="technical-label opacity-40 whitespace-nowrap">@{match.defenderEngine.owner.username}</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1fr_300px] gap-20">
        {/* Game List */}
        <div className="flex flex-col gap-10">
          <div className="flex items-center justify-between border-b border-border-custom pb-4">
            <h2 className="technical-label">Detailed Games</h2>
            <span className="technical-label opacity-40">{match.games.length} / {match.gamesPlanned} Recorded</span>
          </div>
          
          <div className="flex flex-col">
            {(match?.games || []).map((game: any, idx: number) => (
              <div key={game.id} className="grid grid-cols-[80px_1fr_60px] items-center py-6 border-b border-border-custom">
                <span className="technical-label opacity-30">Game {idx + 1}</span>
                <div className="flex items-center gap-4 text-sm font-medium">
                  <span>{match.challengerEngine.name}</span>
                  <span className="opacity-20 font-mono">VS</span>
                  <span>{match.defenderEngine.name}</span>
                </div>
                <div className="text-right">
                   <span className={`font-mono text-sm font-bold ${
                     game.result === '1-0' ? 'text-accent' : game.result === '0-1' ? 'text-red-800' : 'opacity-40'
                   }`}>
                     {game.result}
                   </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Meta */}
        <div className="flex flex-col gap-12">
          <section className="flex flex-col gap-8 border border-border-custom p-8 soft-shadow bg-black/[0.01]">
             <h3 className="technical-label flex items-center gap-2">
                <FileText size={12} /> Metadata
             </h3>
             <div className="flex flex-col gap-5 text-[11px] font-medium leading-relaxed">
                <div className="flex justify-between border-b border-border-custom pb-3 border-dotted">
                   <span className="opacity-40">UTC Logged</span>
                   <span>{match.completedAt ? new Date(match.completedAt).toLocaleString() : "Pending"}</span>
                </div>
                <div className="flex justify-between border-b border-border-custom pb-3 border-dotted">
                   <span className="opacity-40">Control</span>
                   <span className="font-mono">40/60 Technical</span>
                </div>
                <div className="flex justify-between border-b border-border-custom pb-3 border-dotted">
                   <span className="opacity-40">Environment</span>
                   <span>Standard Linux</span>
                </div>
             </div>

             <button className="w-full py-3 bg-foreground text-background font-bold text-xs uppercase tracking-tight hover:opacity-90 transition-all flex items-center justify-center gap-2">
                <Download size={14} /> Download PGN
             </button>
          </section>

          <section className="p-8 border border-border-custom flex flex-col gap-4">
             <ShieldCheck size={18} className="text-accent" />
             <div className="flex flex-col gap-2">
                <span className="technical-label">Verified Result</span>
                <p className="text-[11px] leading-relaxed text-muted">
                  Match outcomes are generated by a single-core isolated worker node. Standard FIDE chess rules apply.
                </p>
             </div>
          </section>
        </div>
      </div>
    </div>
  );
}
