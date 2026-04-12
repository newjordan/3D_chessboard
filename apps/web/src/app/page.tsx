import Link from "next/link";
import { ChevronRight, Play, Terminal, Zap, Code, ShieldCheck } from "lucide-react";
import { ApiClient } from "@/lib/apiClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [engines] = await Promise.all([
     ApiClient.getLeaderboard().catch(() => []),
  ]);

  const topEngines = (engines || []).slice(0, 5);

  return (
    <div className="flex flex-col gap-32 pb-32">
      {/* Hero Section */}
      <section className="container mx-auto px-6 pt-20 max-w-5xl">
        <div className="flex flex-col gap-10">
          <div className="technical-label">V.03 / Open Competition</div>
          
          <div className="flex flex-col gap-6">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-3xl leading-[1.05]">
              Make an engine with AI.<br />
              Enter it. See how it ranks.
            </h1>
            <p className="text-lg text-muted max-w-xl leading-relaxed">
              Submit simple Python or JavaScript chess agents. They play 24/7 in an automated arena. Proof of work is determined by result, not theory.
            </p>
          </div>

          <div className="flex items-center gap-6 pt-4">
            <Link 
              href="/submit" 
              className="px-6 py-3 bg-foreground text-background font-bold text-sm hover:opacity-90 transition-all flex items-center gap-2"
            >
              Enter Competition <Play size={14} fill="currentColor" />
            </Link>
            <Link 
              href="/leaderboard" 
              className="technical-label hover:text-accent transition-colors flex items-center gap-1 group"
            >
              Live Standings <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Proof of Life / Ledger */}
      <section className="container mx-auto px-6 max-w-5xl">
        <div className="grid lg:grid-cols-[1fr_350px] gap-20">
          <div className="flex flex-col gap-12">
            <div className="flex flex-col gap-4">
              <span className="technical-label">Active Ledger</span>
              <h2 className="text-3xl font-bold tracking-tight">Real-time performance proof.</h2>
              <p className="text-muted text-sm max-w-md">
                This isn't a leaderboard; it's a verifiable history of match outcomes. Ratings are calculated in real-time as games finish.
              </p>
            </div>

            <div className="flex flex-col border-t border-border-custom">
              {topEngines.map((engine, i) => (
                <div key={engine.id} className="grid grid-cols-[40px_1fr_100px] items-center py-5 border-b border-border-custom hover:bg-white/[0.02] transition-colors group">
                  <span className="font-mono text-xs opacity-30">0{i + 1}</span>
                  <div className="flex flex-col">
                    <Link href={`/engines/${engine.slug}`} className="font-bold text-sm group-hover:underline">
                      {engine.name}
                    </Link>
                    <span className="technical-label text-[10px] lowercase opacity-60">@{engine.owner.username}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-sm font-bold tracking-tight">{engine.currentRating}</span>
                    <span className="technical-label ml-1 block opacity-40">Elo</span>
                  </div>
                </div>
              ))}
              <Link href="/leaderboard" className="py-6 technical-label text-center hover:text-accent transition-colors">
                View Full Ladder &rarr;
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-12 lg:pt-20">
             <div className="flex flex-col gap-8">
               <div className="flex flex-col gap-2">
                 <span className="technical-label">The Prize Pool</span>
                 <p className="text-4xl font-bold tracking-tighter">$150.00 <span className="text-base font-medium text-muted">/ Mo.</span></p>
               </div>
               <div className="text-[13px] text-muted space-y-4">
                  <p>Competition is split monthly. 1st takes $100, 2nd and 3rd take $25 each.</p>
                  <p>Payments are issued at precisely midnight on the 1st of every month to the verified owner.</p>
               </div>
             </div>
          </div>
        </div>
      </section>

      {/* Participation Guide */}
      <section className="bg-white/[0.02] border-y border-border-custom py-24">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="grid md:grid-cols-3 gap-16">
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

      {/* Rules Section */}
      <section className="container mx-auto px-6 max-w-5xl">
        <div className="grid md:grid-cols-2 gap-20">
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
      <section className="container mx-auto px-6 max-w-5xl pt-20">
        <div className="border border-border-custom p-16 flex flex-col items-center text-center gap-8 soft-shadow bg-white/[0.01]">
          <h2 className="text-4xl font-bold tracking-tight">Prove your prompt.</h2>
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
