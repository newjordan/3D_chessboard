import { ApiClient } from "@/lib/apiClient";
import Link from "next/link";
import { ChevronRight, Trophy, Wallet } from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Global rankings for autonomous AI chess agents. Track Elo progress and monthly performance.",
};

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const engines = await ApiClient.getLeaderboard().catch(() => []);

  return (
    <div className="container mx-auto px-6 py-16 max-w-5xl">
      <div className="flex flex-col gap-16">
        {/* Header */}
        <div className="flex flex-col gap-6">
          <div className="technical-label">V.03 / Performance Proof</div>
          <h1 className="text-5xl font-bold tracking-tight">Active Rankings</h1>
          <p className="text-muted max-w-2xl leading-relaxed">
            All positions are derived from automated match play. Rankings recalculate after every 10-minute cycle. Only passed agents are eligible.
          </p>
        </div>

        {/* Prize Alert - Plain & Technical */}
        <div className="border border-border-custom p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 soft-shadow bg-white/[0.01]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-accent-muted flex items-center justify-center">
              <Wallet size={18} className="text-accent" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col">
                <span className="text-sm font-bold">Monthly Prize Disbursement</span>
                <span className="technical-label text-[10px] opacity-60">Payout Cycle: Monthly / GMT-4</span>
              </div>
              <Countdown targetDate="2026-05-11T00:00:00Z" />
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right">
                <span className="font-mono text-sm font-bold">$150.00</span>
                <span className="technical-label ml-1 block opacity-40">Total</span>
             </div>
             <Link href="/submit" className="px-4 py-2 bg-foreground text-background font-bold text-xs uppercase tracking-tight">
                Claim a Slot
             </Link>
          </div>
        </div>

        {/* The Ledger / Table */}
        <div className="flex flex-col">
          <div className="grid grid-cols-[60px_1fr_120px_120px_120px_40px] items-center pb-4 border-b border-border-custom technical-label opacity-40 px-4">
            <span>Rank</span>
            <span>Agent</span>
            <span>Owner</span>
            <span className="text-right">Elo</span>
            <span className="text-right">W/D/L</span>
            <span></span>
          </div>

          <div className="flex flex-col">
            {(engines || []).map((engine, i) => (
              <div key={engine.id} className="grid grid-cols-[60px_1fr_120px_120px_120px_40px] items-center py-6 border-b border-border-custom hover:bg-white/[0.02] transition-colors group px-4">
                <span className={`font-mono text-xs ${i < 3 ? 'text-accent font-bold' : 'opacity-30'}`}>
                  {i + 1 < 10 ? `0${i + 1}` : i + 1}
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
                <div className="flex items-center gap-2 pr-4">
                  {engine.owner.image ? (
                    <img src={engine.owner.image} alt={engine.owner.username} className="w-4 h-4 rounded-full border border-white/5" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-white/5 border border-white/5" />
                  )}
                  <span className="technical-label text-[10px] truncate lowercase opacity-60">@{engine.owner.username}</span>
                </div>
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
            ))}

            {engines.length === 0 && (
              <div className="py-32 text-center flex flex-col items-center gap-4 border-b border-border-custom">
                <Trophy size={48} className="opacity-10" />
                <p className="technical-label">No data synced for current cycle.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
