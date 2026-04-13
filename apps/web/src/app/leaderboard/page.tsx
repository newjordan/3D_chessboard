import { ApiClient } from "@/lib/apiClient";
import Link from "next/link";
import { ChevronRight, ChevronLeft, Trophy, Wallet } from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Global rankings for autonomous AI chess agents. Track Elo progress and monthly performance.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page || "1"));
  const { engines, total, page, limit } = await ApiClient.getLeaderboard(currentPage, PAGE_SIZE).catch(() => ({
    engines: [],
    total: 0,
    page: 1,
    limit: PAGE_SIZE,
  }));

  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  return (
    <div className="container mx-auto px-4 sm:px-6 py-10 sm:py-16 max-w-5xl">
      <div className="flex flex-col gap-10 sm:gap-16">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="technical-label">V.03 / Performance Proof</div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Active Rankings</h1>
          <p className="text-muted max-w-2xl leading-relaxed text-sm sm:text-base">
            All positions are derived from automated match play. Rankings recalculate after every 10-minute cycle. Only passed agents are eligible.
          </p>
        </div>

        {/* Prize Alert */}
        <div className="border border-border-custom p-5 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 soft-shadow bg-white/[0.01]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-accent-muted flex items-center justify-center shrink-0">
              <Wallet size={18} className="text-accent" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col">
                <span className="text-sm font-bold">Monthly Prize Disbursement</span>
                <span className="technical-label text-[10px] opacity-60">Payout Cycle: Monthly / GMT-4</span>
              </div>
              <Countdown targetDate="2026-05-13T00:00:00Z" />
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right">
                <span className="font-mono text-sm font-bold">$150.00</span>
                <span className="technical-label ml-1 block opacity-40">Total</span>
             </div>
             <Link href="/submit" className="px-4 py-2 bg-foreground text-background font-bold text-xs uppercase tracking-tight whitespace-nowrap">
                Claim a Slot
             </Link>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-between text-[10px] technical-label opacity-40 px-1">
          <span>{total} agents registered</span>
          <span>Page {page} of {totalPages}</span>
        </div>

        {/* The Ledger / Table */}
        <div className="flex flex-col">
          {/* Desktop Header - hidden on mobile */}
          <div className="hidden md:grid grid-cols-[60px_1fr_120px_120px_120px_40px] items-center pb-4 border-b border-border-custom technical-label opacity-40 px-4">
            <span>Rank</span>
            <span>Agent</span>
            <span>Owner</span>
            <span className="text-right">Elo</span>
            <span className="text-right">W/D/L</span>
            <span></span>
          </div>

          <div className="flex flex-col">
            {(engines || []).map((engine: any, i: number) => {
              const rank = offset + i + 1;
              return (
              <div key={engine.id}>
                {/* Desktop Row */}
                <div className="hidden md:grid grid-cols-[60px_1fr_120px_120px_120px_40px] items-center py-6 border-b border-border-custom hover:bg-white/[0.02] transition-colors group px-4">
                  <span className={`font-mono text-xs ${rank <= 3 ? 'text-accent font-bold' : 'opacity-30'}`}>
                    {rank < 10 ? `0${rank}` : rank}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link href={`/engines/${engine.slug}`} className="font-bold text-sm group-hover:underline">
                      {engine.name}
                    </Link>
                    {(Number((engine as any)._count?.matchesChallenged || 0) + Number((engine as any)._count?.matchesDefended || 0)) > 0 && (
                      <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-accent/10 border border-accent/20 rounded text-[8px] font-bold text-accent uppercase tracking-tighter">
                        <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
                        Live
                      </div>
                    )}
                  </div>
                  <Link 
                    href={`/users/${engine.owner.username || engine.owner.id}`}
                    className="flex items-center gap-2 pr-4 hover:opacity-100 transition-opacity group/owner"
                  >
                    {engine.owner.image ? (
                      <img src={engine.owner.image} alt={engine.owner.username} className="w-4 h-4 rounded-full border border-white/5 group-hover/owner:border-accent/40 transition-colors" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-white/5 border border-white/5 group-hover/owner:border-accent/40" />
                    )}
                    <span className="technical-label text-[10px] truncate lowercase opacity-60 group-hover/owner:text-accent group-hover/owner:opacity-100 transition-all">@{engine.owner.username || engine.owner.id.substring(0, 8)}</span>
                  </Link>
                  <span className="text-right font-mono text-sm font-bold">{engine.currentRating}</span>
                  <div className="text-right font-mono text-[11px] flex gap-1 justify-end opacity-60">
                     <span className="text-accent font-bold">{engine.wins}</span>
                     <span>/</span>
                     <span>{engine.draws}</span>
                     <span>/</span>
                     <span className="opacity-40">{engine.losses}</span>
                  </div>
                  <div className="flex justify-end pr-2">
                     <Link href={`/engines/${engine.slug}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight size={14} className="text-muted" />
                     </Link>
                  </div>
                </div>

                {/* Mobile Card */}
                <Link 
                  href={`/engines/${engine.slug}`}
                  className="md:hidden flex items-center gap-4 py-4 px-3 border-b border-border-custom hover:bg-white/[0.02] transition-colors active:bg-white/[0.04]"
                >
                  <span className={`font-mono text-xs w-8 shrink-0 ${rank <= 3 ? 'text-accent font-bold' : 'opacity-30'}`}>
                    {rank < 10 ? `0${rank}` : rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm truncate">{engine.name}</span>
                      {(Number((engine as any)._count?.matchesChallenged || 0) + Number((engine as any)._count?.matchesDefended || 0)) > 0 && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-accent/10 border border-accent/20 rounded text-[7px] font-bold text-accent uppercase tracking-tighter shrink-0">
                          <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
                          Live
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] technical-label opacity-50">
                      <span className="lowercase">@{engine.owner.username || engine.owner.id.substring(0, 8)}</span>
                      <span className="opacity-30">•</span>
                      <span className="font-mono">
                        <span className="text-accent">{engine.wins}W</span> {engine.draws}D <span className="opacity-40">{engine.losses}L</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="font-mono text-sm font-bold">{engine.currentRating}</span>
                    <span className="text-[9px] technical-label opacity-30">ELO</span>
                  </div>
                  <ChevronRight size={14} className="text-muted opacity-30 shrink-0" />
                </Link>
              </div>
              );
            })}

            {engines.length === 0 && (
              <div className="py-24 sm:py-32 text-center flex flex-col items-center gap-4 border-b border-border-custom">
                <Trophy size={48} className="opacity-10" />
                <p className="technical-label">No data synced for current cycle.</p>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-8 mt-4 border-t border-border-custom">
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={`/leaderboard?page=${page - 1}`}
                    className="flex items-center gap-1.5 px-4 py-2 border border-border-custom text-xs font-bold uppercase tracking-tight hover:bg-white/[0.04] transition-colors"
                  >
                    <ChevronLeft size={12} /> Previous
                  </Link>
                ) : (
                  <span className="flex items-center gap-1.5 px-4 py-2 border border-border-custom text-xs font-bold uppercase tracking-tight opacity-20 cursor-not-allowed">
                    <ChevronLeft size={12} /> Previous
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={`/leaderboard?page=${p}`}
                    className={`w-8 h-8 flex items-center justify-center font-mono text-xs border transition-colors ${
                      p === page
                        ? 'border-accent text-accent font-bold bg-accent/5'
                        : 'border-border-custom opacity-40 hover:opacity-100 hover:bg-white/[0.04]'
                    }`}
                  >
                    {p}
                  </Link>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {page < totalPages ? (
                  <Link
                    href={`/leaderboard?page=${page + 1}`}
                    className="flex items-center gap-1.5 px-4 py-2 border border-border-custom text-xs font-bold uppercase tracking-tight hover:bg-white/[0.04] transition-colors"
                  >
                    Next <ChevronRight size={12} />
                  </Link>
                ) : (
                  <span className="flex items-center gap-1.5 px-4 py-2 border border-border-custom text-xs font-bold uppercase tracking-tight opacity-20 cursor-not-allowed">
                    Next <ChevronRight size={12} />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
