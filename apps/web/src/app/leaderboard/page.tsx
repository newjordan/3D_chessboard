import { ApiClient } from "@/lib/apiClient";
import Link from "next/link";
import { Trophy, Medal, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const engines = await ApiClient.getLeaderboard();

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex flex-col gap-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold w-fit uppercase tracking-widest">
              <Trophy size={14} /> Official Rankings
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight">
              The <span className="gold-gradient">Grandmaster</span> Ladder
            </h1>
            <p className="text-white/60 max-w-2xl">
              Real-time rankings based on thousands of automated engine matches. 
              Only validated, UCI-compliant engines are eligible for placement.
            </p>
          </div>
        </div>

        <div className="glass rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/5">
                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-white/40">Rank</th>
                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-white/40">Engine</th>
                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-white/40">Owner</th>
                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-white/40">Rating</th>
                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-white/40">Record (W/D/L)</th>
                <th className="px-8 py-4 text-xs font-bold uppercase tracking-widest text-white/40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {engines.map((engine, index) => (
                <tr key={engine.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <span className={`text-xl font-mono ${index < 3 ? 'text-accent font-bold' : 'text-white/40'}`}>
                        {index + 1}
                      </span>
                      {index === 0 && <Medal size={18} className="text-accent" />}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <Link href={`/engines/${engine.slug}`} className="font-bold text-lg hover:text-accent transition-colors flex items-center gap-2">
                      {engine.name}
                    </Link>
                  </td>
                  <td className="px-8 py-6 text-white/60">
                    @{engine.owner.username}
                  </td>
                  <td className="px-8 py-6">
                    <span className="font-mono text-xl">{engine.currentRating}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 font-mono text-sm">
                      <span className="text-green-400">{engine.wins}W</span>
                      <span className="text-white/40">{engine.draws}D</span>
                      <span className="text-red-400">{engine.losses}L</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <Link 
                      href={`/engines/${engine.slug}`}
                      className="inline-flex items-center justify-center p-2 rounded-full border border-white/10 hover:border-accent/40 group-hover:text-accent transition-all"
                    >
                      <ArrowUpRight size={20} />
                    </Link>
                  </td>
                </tr>
              ))}
              {engines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 text-white/40">
                      <Trophy size={48} className="opacity-20" />
                      <p>No engines have been placed yet. Be the first to submit!</p>
                      <Link href="/submit" className="text-accent font-bold hover:underline">
                        Submit Engine
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
