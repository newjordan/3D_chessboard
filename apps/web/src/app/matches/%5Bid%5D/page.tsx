import { prisma } from "db";
import { notFound } from "next/navigation";
import { 
  Trophy, 
  ChevronRight, 
  FileText, 
  Calendar, 
  Clock, 
  ShieldCheck,
  Download
} from "lucide-react";
import Link from "next/link";

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: {
      challengerEngine: true,
      defenderEngine: true,
      challengerVersion: true,
      defenderVersion: true,
      games: {
        orderBy: { roundIndex: "asc" }
      }
    }
  });

  if (!match) {
    notFound();
  }

  const winner = Number(match.challengerScore) > Number(match.defenderScore) 
    ? match.challengerEngine 
    : Number(match.defenderScore) > Number(match.challengerScore) 
      ? match.defenderEngine 
      : null;

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col gap-10">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm text-white/40">
          <Link href="/leaderboard" className="hover:text-accent transition-colors">Leaderboard</Link>
          <ChevronRight size={14} />
          <span className="text-white/60">Match #{match.id.substring(0, 8)}</span>
        </nav>

        {/* Match Header */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 p-12 glass rounded-[3rem] border border-white/5 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
          
          {/* Challenger */}
          <div className="flex flex-col items-center text-center gap-6 flex-1">
            <Link href={`/engines/${match.challengerEngine.slug}`} className="group flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-accent/40 transition-all">
                <Trophy size={40} className={winner?.id === match.challengerEngineId ? 'text-accent' : 'text-white/20'} />
              </div>
              <h2 className="text-3xl font-extrabold group-hover:text-accent transition-colors">{match.challengerEngine.name}</h2>
            </Link>
            <span className="text-xs font-mono text-white/40 uppercase tracking-widest">{match.challengerVersion.uciName || 'Challenger'}</span>
          </div>

          {/* Verses / Score */}
          <div className="flex flex-col items-center gap-6">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/20">Final Score</div>
            <div className="flex items-center gap-10">
              <span className="text-7xl font-mono font-black">{match.challengerScore?.toString()}</span>
              <div className="flex flex-col items-center gap-2">
                <div className="w-px h-12 bg-white/20" />
                <span className="text-xl font-bold italic text-white/20">VS</span>
                <div className="w-px h-12 bg-white/20" />
              </div>
              <span className="text-7xl font-mono font-black text-white/40">{match.defenderScore?.toString()}</span>
            </div>
            <div className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
              match.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-white/5 text-white/40 border-white/10'
            }`}>
              {match.status}
            </div>
          </div>

          {/* Defender */}
          <div className="flex flex-col items-center text-center gap-6 flex-1">
            <Link href={`/engines/${match.defenderEngine.slug}`} className="group flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-accent/40 transition-all">
                <Trophy size={40} className={winner?.id === match.defenderEngineId ? 'text-accent' : 'text-white/20'} />
              </div>
              <h2 className="text-3xl font-extrabold group-hover:text-accent transition-colors">{match.defenderEngine.name}</h2>
            </Link>
            <span className="text-xs font-mono text-white/40 uppercase tracking-widest">{match.defenderVersion.uciName || 'Defender'}</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-12">
          {/* Game List */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <h3 className="text-2xl font-bold flex items-center gap-3">
              <Activity className="text-accent" size={24} /> Game-by-Game
            </h3>
            <div className="flex flex-col gap-4">
              {match.games.map((game, idx) => (
                <div key={game.id} className="glass p-6 rounded-2xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <span className="text-sm font-bold text-white/20 uppercase tracking-widest">Game {idx + 1}</span>
                    <div className="flex items-center gap-4">
                      <span className="font-bold">{match.challengerEngine.name}</span>
                      <span className="text-white/20 font-mono">VS</span>
                      <span className="font-bold font-white/60">{match.defenderEngine.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <span className={`font-mono font-bold px-3 py-1 rounded bg-white/5 ${
                      game.result === '1-0' ? 'text-green-400' : game.result === '0-1' ? 'text-red-400' : 'text-white/40'
                    }`}>
                      {game.result}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-8">
            <section className="glass p-8 rounded-[2rem] border border-white/5 flex flex-col gap-6">
              <h3 className="font-bold flex items-center gap-2">
                <FileText size={18} className="text-accent" /> Match Details
              </h3>
              <div className="flex flex-col gap-4 text-sm divide-y divide-white/5">
                <div className="flex justify-between py-3">
                  <span className="text-white/40">Timestamp</span>
                  <span className="text-white/80">{new Date(match.completedAt || match.startedAt || Date.now()).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-white/40">Type</span>
                  <span className="text-white/80 capitalize">{match.matchType} Match</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-white/40">Time Control</span>
                  <span className="text-white/80 font-mono">40/60</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-white/40">Games Recorded</span>
                  <span className="text-white/80">{match.games.length} / {match.gamesPlanned}</span>
                </div>
              </div>

              <button className="w-full py-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-3 text-sm font-bold">
                <Download size={18} /> Download PGN
              </button>
            </section>

            <section className="glass p-8 rounded-[2.5rem] bg-accent/5 border border-accent/20 flex flex-col gap-4 text-center">
              <ShieldCheck size={32} className="text-accent mx-auto" />
              <h4 className="font-bold">Verified Result</h4>
              <p className="text-xs text-white/40 leading-relaxed">
                This match was executed in an isolated Linux container with no network access.
                Results are cryptographically signed by the worker node.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Activity(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}
