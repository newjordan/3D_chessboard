import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Trophy, Zap, Shield, Cpu, Bot, Network, Sparkles } from "lucide-react";
import { ApiClient } from "@/lib/apiClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Fetch Live Data from Backend API
  const [engines, totalGames] = await Promise.all([
     ApiClient.getLeaderboard().catch(() => []),
     ApiClient.getMatch("stats").catch(() => ({ gamesCount: 0 })) // Dummy for stats
  ]);

  const totalEngines = engines?.length || 0;
  const topEngines = (engines || []).slice(0, 3);

  return (
    <div className="flex flex-col gap-20 pb-20 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1000px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-background to-transparent" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150" />
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ 
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: '40px 40px' 
          }} 
        />
      </div>

      {/* Hero Section */}
      <section className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center min-h-[85vh] relative z-10 pt-12">
        <div className="flex flex-col gap-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold w-fit uppercase tracking-widest animate-fade-in">
            <Bot size={14} />
            The AI Agent Proving Ground
          </div>
          <h1 className="text-6xl md:text-7xl font-extrabold leading-[1.1] tracking-tight">
            Forge the Ultimate <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-500 bg-clip-text text-transparent">
              AI Chess Agent
            </span>
          </h1>
          <p className="text-xl text-slate-400 max-w-lg leading-relaxed">
            Deploy your neural-network driven engines into an automated, high-stakes arena. 
            Rigorous sandboxing, deep UCI validation, and real-time performance analytics.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <Link 
              href="/submit" 
              className="px-8 py-4 rounded-2xl bg-blue-600 text-white font-bold text-lg hover:bg-blue-500 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 shadow-xl shadow-blue-600/20"
            >
              Deploy Your Agent <ArrowRight size={20} />
            </Link>
            <Link 
              href="/leaderboard" 
              className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 font-bold text-lg hover:bg-white/10 transition-all backdrop-blur-md"
            >
              The Pro Rankings
            </Link>
          </div>

          <div className="flex items-center gap-12 pt-8">
            <div className="flex flex-col">
              <span className="text-3xl font-bold font-mono text-white">{totalEngines}</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Agents Active</span>
            </div>
            <div className="h-10 w-px bg-white/10" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold font-mono text-white">$150</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">Monthly Prizes</span>
            </div>
          </div>
        </div>

        <div className="relative aspect-[4/3] w-full max-w-[650px] justify-self-center lg:justify-self-end group">
          <div className="absolute inset-0 bg-blue-500/10 blur-[120px] rounded-full group-hover:bg-blue-500/20 transition-colors duration-1000" />
          <div className="relative z-10 w-full h-full rounded-[2.5rem] overflow-hidden border border-white/10 bg-slate-900 shadow-2xl transform hover:-rotate-1 transition-transform duration-700">
            <Image 
              src="/hero-ai.png" 
              alt="AI Chess Visualization" 
              fill
              className="object-cover scale-105 group-hover:scale-100 transition-transform duration-1000"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
          </div>
          
          {/* Floating Stats Tag */}
          <div className="absolute -bottom-6 -left-6 z-20 bg-slate-900/90 backdrop-blur-xl border border-white/10 p-5 rounded-3xl shadow-2xl animate-bounce-subtle">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Network size={20} className="text-blue-400" />
              </div>
              <div>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Efficiency</p>
                <p className="text-lg font-bold">99.9% Up-time</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20 relative z-10">
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: <Cpu className="text-blue-400" size={32} />,
              title: "JS & Python Agents",
              desc: "Submit a single .js or .py file. Your agent reads a FEN position and outputs its best move."
            },
            {
              icon: <Shield className="text-blue-400" size={32} />,
              title: "Sandboxed Execution",
              desc: "Every agent runs in an isolated Docker container with no network access and strict resource limits."
            },
            {
              icon: <Sparkles className="text-blue-400" size={32} />,
              title: "Real-time Elo",
              desc: "Dynamic Elo rating updates after every match. Climb the ladder and compete for monthly prizes."
            }
          ].map((feature, i) => (
            <div key={i} className="group bg-white/[0.02] hover:bg-white/[0.04] p-10 rounded-[2.5rem] border border-white/5 hover:border-blue-500/30 transition-all flex flex-col gap-6">
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <div className="space-y-3">
                <h3 className="text-2xl font-bold">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed text-sm">{feature.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Leaderboard Section */}
      <section className="container mx-auto px-4 py-20 relative z-10">
        <div className="bg-slate-900/40 backdrop-blur-sm p-12 lg:p-16 rounded-[4rem] border border-white/5 relative overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-16">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 blur-[100px] -mr-48 -mt-48" />
          
          <div className="flex flex-col gap-6 max-w-xl text-center lg:text-left relative z-10">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">The Current <br/><span className="text-blue-400">Top Contenders</span></h2>
            <p className="text-slate-400 text-lg">
              The neural ladder is highly volatile. Watch the elite agents fight for dominance in our continuous matchmaking pool.
            </p>
            <Link href="/leaderboard" className="mt-4 flex items-center justify-center lg:justify-start gap-2 text-blue-400 font-bold hover:gap-4 transition-all group">
              Explore Full Standings <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="w-full max-w-lg bg-black/40 backdrop-blur-xl rounded-3xl border border-white/10 p-2 overflow-hidden relative z-10 shadow-2xl">
            <div className="p-6 border-b border-white/5 flex justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              <span>Agent</span>
              <span>Rating</span>
            </div>
            
            {topEngines.map((engine, index) => (
              <div key={engine.id} className="p-6 flex justify-between items-center hover:bg-white/5 transition-all group rounded-2xl border border-transparent hover:border-white/5">
                <div className="flex items-center gap-5">
                  <span className={`text-xl font-mono ${index === 0 ? 'text-blue-400' : 'text-slate-500'}`}>0{index + 1}</span>
                  <div>
                    <h4 className="font-bold text-lg group-hover:text-blue-400 transition-colors">{engine.name}</h4>
                    <p className="text-[10px] text-slate-500 font-medium">By @{engine.owner.username}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-2xl font-bold text-white group-hover:text-blue-400 transition-colors">{engine.currentRating}</span>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Elo</p>
                </div>
              </div>
            ))}
            
            {topEngines.length === 0 && (
              <div className="p-20 text-center text-slate-500 italic">
                Awaiting first ranked agents...
              </div>
            )}
            
            <Link href="/leaderboard" className="block p-6 text-center text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all border-t border-white/5 uppercase tracking-widest">
              Join the Ladder
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
