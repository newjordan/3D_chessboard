import { ApiClient } from "@/lib/apiClient";
import Link from "next/link";
import { ChevronRight, ArrowLeft, History } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MatchesPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ engine?: string }> 
}) {
  const { engine } = await searchParams;
  const matches = await ApiClient.getMatches(engine).catch(() => []);
  
  const filteredEngine = engine && matches.length > 0 
    ? (matches[0].challengerEngine.slug === engine ? matches[0].challengerEngine.name : matches[0].defenderEngine.name)
    : (engine ? engine : null);

  return (
    <div className="container mx-auto px-6 py-16 max-w-5xl flex flex-col gap-12">
      <div className="flex flex-col gap-6">
        <Link href="/leaderboard" className="technical-label flex items-center gap-2 hover:text-accent transition-colors w-fit">
          <ArrowLeft size={12} /> Back to Ladder
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 border border-border-custom bg-white/[0.02]">
              <History size={20} className="opacity-40" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-4xl font-bold tracking-tight">
                {filteredEngine ? `History: ${filteredEngine}` : "Global History"}
              </h1>
              <span className="technical-label opacity-40">
                {filteredEngine ? `Filtered Match Ledger for ${filteredEngine}` : "V.03 / Recent Match Ledger"}
              </span>
            </div>
          </div>
          {filteredEngine && (
            <Link href="/matches" className="text-[10px] technical-label text-accent/60 hover:text-accent transition-colors flex items-center gap-1">
              &times; Clear Filter
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col border-t border-border-custom">
        {matches.map((match: any) => (
          <Link 
            key={match.id}
            href={`/matches/${match.id}`}
            className="grid grid-cols-[100px_1fr_120px_40px] items-center py-8 border-b border-border-custom hover:bg-white/[0.01] transition-all group px-4 -mx-4"
          >
            <span className="font-mono text-[10px] opacity-30">
              {new Date(match.completedAt || 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            
            <div className="flex items-center gap-4 text-sm">
              <span className="font-bold">{match.challengerEngine.name}</span>
              <span className="opacity-20 italic font-mono text-[10px]">VS</span>
              <span className="font-bold">{match.defenderEngine.name}</span>
            </div>

            <div className="flex items-center justify-center gap-4 font-mono text-sm">
              <span className={Number(match.challengerScore) > Number(match.defenderScore) ? 'text-accent font-bold' : 'opacity-40'}>
                {match.challengerScore?.toString()}
              </span>
              <span className="opacity-10">-</span>
              <span className={Number(match.defenderScore) > Number(match.challengerScore) ? 'text-accent font-bold' : 'opacity-40'}>
                {match.defenderScore?.toString()}
              </span>
            </div>

            <div className="flex justify-end">
              <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted" />
            </div>
          </Link>
        ))}

        {matches.length === 0 && (
          <div className="py-24 text-center border-b border-border-custom flex flex-col gap-4 items-center">
             <span className="technical-label opacity-40">The ledger is currently empty.</span>
             <p className="text-sm text-muted max-w-xs">Matches are scheduled every 30 seconds. New data will appear as games finish.</p>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center pt-8">
        <span className="technical-label opacity-20 text-[9px]">End of Recent Ledger</span>
        <Link href="/submit" className="technical-label hover:text-accent transition-colors">Enter Competition &rarr;</Link>
      </div>
    </div>
  );
}
