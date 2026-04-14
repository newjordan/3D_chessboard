import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiClient } from "@/lib/apiClient";
import { ChevronRight, Terminal, Shield, Code2, Server } from "lucide-react";
import Link from "next/link";
import { RunnerDashboard } from "./RunnerDashboard";

export const dynamic = "force-dynamic";

export default async function RunPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  let runnerKey = null;
  if (userId) {
    runnerKey = await ApiClient.getMyRunnerKey(userId).catch(() => null);
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff41] font-mono relative overflow-hidden">
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
      />

      <div className="relative z-20 max-w-4xl mx-auto px-6 py-16 space-y-24">

        {/* Hero */}
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#00ff41]/20 text-[#00ff41]/60 text-xs rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />
            DECENTRALIZED COMPUTE NETWORK
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#00ff41] leading-tight">
            Host the Bouts.<br />
            <span className="text-[#00ff41]/40">Power the Competition.</span>
          </h1>
          <p className="text-[#00ff41]/60 text-lg max-w-2xl leading-relaxed">
            Chess Agents runs 24/7 on community compute. Trusted Arbiters fetch signed match jobs,
            execute them locally, and submit cryptographically-attributed results back to the arena.
            Every job is tamper-proof. Every Arbiter is accountable.
          </p>
          <div className="flex items-center gap-6 pt-2">
            {session ? (
              <a href="#dashboard" className="flex items-center gap-2 px-5 py-2.5 bg-[#00ff41] text-black font-bold text-sm hover:bg-[#00ff41]/90 transition-colors">
                View My Arbiter Key <ChevronRight size={14} />
              </a>
            ) : (
              <Link href="/api/auth/signin" className="flex items-center gap-2 px-5 py-2.5 bg-[#00ff41] text-black font-bold text-sm hover:bg-[#00ff41]/90 transition-colors">
                Sign In to Get Started <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </section>

        {/* How It Works */}
        <section className="space-y-8">
          <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
            HOW IT WORKS
          </h2>
          <div className="bg-black/40 border border-[#00ff41]/10 rounded p-6 text-sm text-[#00ff41]/70 leading-loose">
            <pre className="whitespace-pre-wrap">{`[Your Arbiter]  ──── POST /api/broker/next-jobs ────▶  [Arena API]
               ◀─── Job + serverSignature ───────────

[Your Arbiter]  ──── verifySignature(job) ──────────▶  ✓ or ✗
               (engine code obfuscated in transit)

[Your Arbiter]  ──── arbitrate(challenger, defender) ▶  [Local]
               ◀─── result (PGN + scores) ───────────

[Your Arbiter]  ──── POST /api/broker/submit ────────▶  [Arena API]
               ◀─── { success: true } ──────────────`}</pre>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: <Shield size={18} />, title: "Signed Jobs", desc: "Every job payload is Ed25519-signed by the server. Your runner verifies before executing — no tampered code ever runs." },
              { icon: <Code2 size={18} />, title: "Obfuscated & Signed", desc: "Engine code is obfuscated before dispatch and the payload is Ed25519-signed. Your arbiter verifies the signature before executing anything." },
              { icon: <Server size={18} />, title: "Attributed Results", desc: "Every submitted result is signed with your Arbiter key and tracked. Your contribution is permanently recorded." },
            ].map((item) => (
              <div key={item.title} className="border border-[#00ff41]/10 rounded p-5 space-y-3">
                <div className="text-[#00ff41]/60">{item.icon}</div>
                <h3 className="text-[#00ff41] text-sm font-bold">{item.title}</h3>
                <p className="text-[#00ff41]/50 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quickstart */}
        <section className="space-y-6">
          <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
            QUICKSTART
          </h2>
          <p className="text-[#00ff41]/60 text-sm">Once you have a trusted Arbiter Key from an admin, run with Docker (recommended):</p>
          <pre className="bg-black border border-[#00ff41]/20 rounded p-5 text-[#00ff41] text-sm overflow-x-auto">
{`docker run \\
  -e WORKER_PRIVATE_KEY="<your-private-key>" \\
  ghcr.io/jaymaart/chess-agents-arbiter:latest`}
          </pre>
          <p className="text-[#00ff41]/60 text-sm">Or with Node.js 18+ and Python 3 (source is fully open at <a href="https://github.com/jaymaart/chess-agents-arbiter" target="_blank" className="underline hover:text-[#00ff41]">github.com/jaymaart/chess-agents-arbiter</a>):</p>
          <pre className="bg-black border border-[#00ff41]/20 rounded p-5 text-[#00ff41] text-sm overflow-x-auto">
{`git clone https://github.com/jaymaart/chess-agents-arbiter
cd chess-arbiter
npm install && npm run build

WORKER_PRIVATE_KEY="<your-private-key>" node dist/index.js`}
          </pre>
        </section>

        {/* Requirements */}
        <section className="space-y-6">
          <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
            REQUIREMENTS & LIMITS
          </h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              ["Account", "Required — Arbiter key is tied to your user account"],
              ["Admin Approval", "Your key must be marked trusted before bouts are served"],
              ["Max Batch Size", "100 jobs per request"],
              ["Supported Languages", "JavaScript (.js), Python (.py)"],
              ["Match Type", "Rating matches only (placement is reserved)"],
              ["Hardware", "Any machine capable of running Node.js 18+ or Python 3.10+"],
              ["Docker", "Optional — docker image available for easy setup"],
              ["Uptime", "No minimum — run as much or as little as you like"],
            ].map(([key, val]) => (
              <div key={key} className="flex gap-3 border border-[#00ff41]/10 rounded p-4">
                <span className="text-[#00ff41]/40 shrink-0 w-36">{key}</span>
                <span className="text-[#00ff41]/70">{val}</span>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-6">
          <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
            FAQ
          </h2>
          <div className="space-y-4">
            {[
              { q: "Do I need an account?", a: "Yes. Arbiter keys are tied to your Chess Agents account. Sign up, then visit #become-an-arbiter to request a key." },
              { q: "How do I get an Arbiter key?", a: "After signing up, reach out to an admin in Discord. They generate a keypair — your private key is shown exactly once and never stored on the server, so copy it before closing. Your public key is what identifies you on the network." },
              { q: "What hardware do I need?", a: "Anything that can run Docker or Node.js 18+. A basic VPS or spare laptop is sufficient. No GPU required." },
              { q: "What matches will I arbitrate?", a: "Rating matches only. Placement matches (for newly validated engines) are reserved for the internal system." },
              { q: "What if my node submits a bad result?", a: "The server validates all submissions — game count, player identity, and score integrity. Bad submissions are rejected. Repeated failures can result in key revocation." },
              { q: "Is my private key safe?", a: "Your private key is shown exactly once at issuance and never stored on the server. Treat it like a password. If compromised, contact an admin to revoke and reissue." },
              { q: "What happens if someone tampers with my job?", a: "Your arbiter verifies the server's Ed25519 signature before executing. Any tampered payload is silently rejected. Engine code is also obfuscated in transit." },
              { q: "Can I see what code I'm running?", a: "Yes — the arbiter source is fully open at github.com/jaymaart/chess-agents-arbiter. The Docker image is built directly from that repo. Nothing hidden." },
              { q: "Will there be a leaderboard?", a: "Your jobs processed count is tracked and shown on this page. A public leaderboard is planned for future releases." },
            ].map((item) => (
              <details key={item.q} className="group border border-[#00ff41]/10 rounded">
                <summary className="px-5 py-4 text-sm text-[#00ff41]/80 cursor-pointer hover:text-[#00ff41] transition-colors list-none flex items-center justify-between">
                  {item.q}
                  <ChevronRight size={14} className="group-open:rotate-90 transition-transform text-[#00ff41]/30" />
                </summary>
                <div className="px-5 pb-4 text-xs text-[#00ff41]/50 leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* Runner Dashboard (authenticated) */}
        {session && (
          <section id="dashboard" className="space-y-6">
            <h2 className="text-xs uppercase tracking-widest text-[#00ff41]/40 border-b border-[#00ff41]/10 pb-3">
              YOUR ARBITER STATUS
            </h2>
            <RunnerDashboard initialKey={runnerKey} />
          </section>
        )}

        {!session && (
          <section className="border border-[#00ff41]/10 rounded p-8 text-center space-y-4">
            <Terminal size={32} className="mx-auto text-[#00ff41]/30" />
            <h3 className="text-[#00ff41]/70 font-bold">Sign in to view your Arbiter status</h3>
            <p className="text-[#00ff41]/40 text-sm">Your Arbiter key and stats are linked to your account.</p>
            <Link href="/api/auth/signin" className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#00ff41] text-black font-bold text-sm hover:bg-[#00ff41]/90 transition-colors mt-2">
              Sign In
            </Link>
          </section>
        )}

      </div>
    </div>
  );
}
