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
        {matches.map((match: any) => {
          // When filtered by engine, find the delta for that specific engine
          const filteredEngineId = engine
            ? (match.challengerEngine.slug === engine ? match.challengerEngine.id : match.defenderEngine.id)
            : null;
          const filteredDelta = filteredEngineId
            ? (match.ratings?.find((r: any) => r.engineId === filteredEngineId)?.delta ?? null)
            : null;
          const challengerDelta = match.ratings?.find((r: any) => r.engineId === match.challengerEngine.id)?.delta ?? null;
          const defenderDelta = match.ratings?.find((r: any) => r.engineId === match.defenderEngine.id)?.delta ?? null;

          return (
          <Link
            key={match.id}
            href={`/matches/${match.id}`}
            className="grid grid-cols-[100px_1fr_80px_120px_40px] items-center py-8 border-b border-border-custom hover:bg-white/[0.01] transition-all group px-4 -mx-4"
          >
            <span className="font-mono text-[10px] opacity-30">
              {new Date(match.completedAt || match.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>

            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className={`font-bold ${engine && match.challengerEngine.slug === engine ? '' : 'opacity-60'}`}>
                  {match.challengerEngine.name}
                </span>
                {match.status === 'running' && (
                  <span className="px-1 py-0.5 rounded-full bg-accent/10 border border-accent/20 animate-pulse text-[7px] font-bold text-accent">LIVE</span>
                )}
                {match.status === 'queued' && (
                  <span className="px-1 py-0.5 border border-border-custom bg-white/[0.02] text-[7px] font-bold opacity-30 uppercase">Queued</span>
                )}
              </div>
              <span className="opacity-20 italic font-mono text-[10px]">VS</span>
              <span className={`font-bold ${engine && match.defenderEngine.slug === engine ? '' : 'opacity-60'}`}>
                {match.defenderEngine.name}
              </span>
            </div>

            {/* Elo delta column */}
            <div className="text-right hidden sm:block">
              {match.status === 'completed' && (
                engine ? (
                  filteredDelta != null && (
                    <span className={`font-mono text-[11px] font-bold ${
                      filteredDelta > 0 ? 'text-accent' : filteredDelta < 0 ? 'text-red-400' : 'opacity-30'
                    }`}>
                      {filteredDelta > 0 ? '+' : ''}{filteredDelta}
                    </span>
                  )
                ) : (
                  <div className="flex items-center justify-end gap-1 font-mono text-[10px]">
                    {challengerDelta != null && (
                      <span className={challengerDelta > 0 ? 'text-accent' : challengerDelta < 0 ? 'text-red-400' : 'opacity-30'}>
                        {challengerDelta > 0 ? '+' : ''}{challengerDelta}
                      </span>
                    )}
                    {challengerDelta != null && defenderDelta != null && <span className="opacity-20">/</span>}
                    {defenderDelta != null && (
                      <span className={defenderDelta > 0 ? 'text-accent' : defenderDelta < 0 ? 'text-red-400' : 'opacity-30'}>
                        {defenderDelta > 0 ? '+' : ''}{defenderDelta}
                      </span>
                    )}
                  </div>
                )
              )}
            </div>

            <div className="flex items-center justify-center gap-4 font-mono text-sm">
              {match.status === 'completed' ? (
                <>
                  <span className={Number(match.challengerScore) > Number(match.defenderScore) ? 'text-accent font-bold' : 'opacity-40'}>
                    {match.challengerScore?.toString()}
                  </span>
                  <span className="opacity-10">-</span>
                  <span className={Number(match.defenderScore) > Number(match.challengerScore) ? 'text-accent font-bold' : 'opacity-40'}>
                    {match.defenderScore?.toString()}
                  </span>
                </>
              ) : (
                <span className="text-[9px] technical-label opacity-20 italic">Ongoing</span>
              )}
            </div>

            <div className="flex justify-end">
              <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted" />
            </div>
          </Link>
          );
        })}

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
