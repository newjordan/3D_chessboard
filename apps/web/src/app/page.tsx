import Link from "next/link";
import { ChevronRight, Play, Terminal, Zap, Code, ShieldCheck } from "lucide-react";
import { ApiClient } from "@/lib/apiClient";
import { Countdown } from "@/components/Countdown";
import { ShowcaseReplay } from "@/components/landing/ShowcaseReplay";

export const dynamic = "force-dynamic";

export default async function Home() {
  const leaderboardData = await ApiClient.getLeaderboard(1, 5).catch(() => ({ engines: [], total: 0, page: 1, limit: 5 }));
  const topEngines = leaderboardData.engines || [];

  return (
    <div className="flex flex-col gap-16 sm:gap-32 pb-16 sm:pb-32">
      {/* Hero Section with Side-by-Side Ledger */}
      <section className="container mx-auto px-4 sm:px-6 pt-12 sm:pt-20 max-w-5xl">
        <div className="grid lg:grid-cols-[1fr_380px] gap-12 lg:gap-24 items-start">
          {/* Left: Content */}
          <div className="flex flex-col gap-10">
            <div className="technical-label">V.03 / Open Competition</div>
            
            <div className="flex flex-col gap-6">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                Make an engine with AI.<br />
                Enter it. See how it ranks.
              </h1>
              <p className="text-lg text-muted max-w-xl leading-relaxed">
                Submit simple Python or JavaScript chess agents. They play 24/7 in an automated arena. Proof of work is determined by result, not theory.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 pt-4">
              <Link 
                href="/submit" 
                className="px-6 py-3 bg-foreground text-background font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2"
              >
                Enter Competition <Play size={11} fill="currentColor" />
              </Link>
              <Link 
                href="/leaderboard" 
                className="technical-label hover:text-accent transition-colors flex items-center gap-1 group"
              >
                Live Standings <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Right: Condensed Ledger */}
          <div className="flex flex-col gap-8 lg:pt-2">
            <div className="flex flex-col gap-2 border-b border-border-custom pb-4">
              <span className="technical-label">Live Standings</span>
              <span className="text-xs text-muted opacity-60 font-mono italic">Real-time Proof of Results</span>
            </div>

            <div className="flex flex-col border-b border-border-custom bg-white/[0.01]">
              {topEngines.map((engine, i) => (
                <div key={engine.id} className="grid grid-cols-[30px_1fr_50px] items-center py-4 border-b border-border-custom hover:bg-white/[0.02] transition-colors group px-2 last:border-0">
                  <span className="font-mono text-[9px] opacity-20">0{i + 1}</span>
                    <div className="flex items-center gap-2">
                      <Link href={`/engines/${engine.slug}`} className="font-bold text-[13px] group-hover:underline truncate pr-2">
                        {engine.name}
                      </Link>
                      {(Number((engine as any)._count?.matchesChallenged || 0) + Number((engine as any)._count?.matchesDefended || 0)) > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" title="In active match" />
                      )}
                    </div>
                    <span className="technical-label text-[9px] lowercase opacity-40 pr-2 truncate">@{engine.owner.username || engine.owner.id.substring(0, 8)}</span>
                  <div className="text-right">
                    <span className="font-mono text-sm font-bold tracking-tight">{engine.currentRating}</span>
                  </div>
                </div>
              ))}
              {topEngines.length === 0 && (
                <div className="py-12 text-center text-[10px] technical-label opacity-20 italic">
                  Awaiting matches...
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6 pt-4">
               <div className="flex flex-col gap-2">
                  <span className="technical-label opacity-40">Next Prize Cycle</span>
                  <Countdown targetDate="2026-05-11T00:00:00Z" />
               </div>
               <div className="flex justify-between items-center text-[10px] border-t border-border-custom pt-4">
                  <span className="technical-label opacity-40">$150.00 Prize / Mo.</span>
                  <Link href="/leaderboard" className="technical-label hover:text-accent transition-all">View Full Ladder &rarr;</Link>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Showcase Section */}
      <section className="container mx-auto px-4 sm:px-6 max-w-5xl -mt-4 sm:-mt-10 mb-10 sm:mb-20">
        <ShowcaseReplay />
      </section>

      {/* Participation Guide */}
      <section className="bg-white/[0.02] border-y border-border-custom py-12 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
          <div className="grid md:grid-cols-3 gap-10 sm:gap-16">
            {[
              {
                icon: <Terminal size={18} />,
                step: "01",
                label: "Generate",
                title: "Build with LLMs.",
                desc: "Ask Claude or GPT-4o to write a UCI-compatible chess engine in Python or JS. No manual coding required if you prompt well."
              },
              {
                icon: <Code size={18} />,
                step: "02",
                label: "Validate",
                title: "Local Handshake.",
                desc: "Ensure your engine responds correctly to a FEN string. We probe every submission to ensure it's playable."
              },
              {
                icon: <Play size={18} />,
                step: "03",
                label: "Survive",
                title: "Automated Arena.",
                desc: "Matches are scheduled every 30 seconds. Your engine survives and climbs based on its actual ability to win."
              }
            ].map((card, i) => (
              <div key={i} className="flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-border-custom pb-4">
                  <div className="w-8 h-8 rounded-full border border-border-custom flex items-center justify-center opacity-40">
                    {card.icon}
                  </div>
                  <span className="font-mono text-[10px] opacity-20 uppercase tracking-widest">Step {card.step}</span>
                </div>
                <div className="space-y-3">
                  <div className="technical-label">{card.label}</div>
                  <h3 className="text-xl font-bold tracking-tight">{card.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Constraints / Rules */}
      <section className="container mx-auto px-4 sm:px-6 max-w-5xl">
        <div className="grid md:grid-cols-2 gap-10 sm:gap-20">
          <div className="flex flex-col gap-8">
            <span className="technical-label">Legality & Terms</span>
            <h2 className="text-3xl font-bold tracking-tight">The Constraints.</h2>
          </div>
          <div className="flex flex-col gap-10">
             {[
               { icon: <Zap size={16} fill="var(--accent)" className="text-accent" />, text: "Engines have 5 seconds per move total time budget." },
               { icon: <Code size={16} className="text-accent" />, text: "Standard Chess rules apply. 2 games per match (alternate colors)." },
               { icon: <ShieldCheck size={16} className="text-accent" />, text: "Max 3 engines per person. No sockpuppets or flooding." }
             ].map((rule, i) => (
               <div key={i} className="flex gap-4 items-start">
                  <div className="mt-1 shrink-0">{rule.icon}</div>
                  <p className="text-sm font-medium leading-relaxed">{rule.text}</p>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Final Call */}
      <section className="container mx-auto px-4 sm:px-6 max-w-5xl pt-10 sm:pt-20">
        <div className="border border-border-custom p-8 sm:p-16 flex flex-col items-center text-center gap-6 sm:gap-8 soft-shadow bg-white/[0.01]">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Prove your prompt.</h2>
          <p className="text-muted max-w-md">Join 150+ other agents in the live arena. Validation takes less than 10 seconds.</p>
          <Link 
            href="/submit" 
            className="px-10 py-4 bg-foreground text-background font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2"
          >
            Submit Now
          </Link>
          <div className="technical-label opacity-40">Open Competition / Established 2026</div>
        </div>
      </section>
    </div>
  );
}
