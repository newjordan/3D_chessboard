"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, CheckCircle, XCircle, Clock, Zap, AlertTriangle, ExternalLink } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border-custom text-muted hover:text-foreground hover:border-foreground/30 transition-colors"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StatusBadge({ runnerKey }: { runnerKey: any }) {
  if (runnerKey.revokedAt) return <span className="flex items-center gap-1.5 text-red-400 text-sm"><XCircle size={13} /> Revoked</span>;
  if (runnerKey.trusted) return <span className="flex items-center gap-1.5 text-accent text-sm"><CheckCircle size={13} /> Trusted</span>;
  return <span className="flex items-center gap-1.5 text-amber-400 text-sm"><Clock size={13} /> Pending Approval</span>;
}

export function ArbiterTab({ runnerKey }: { runnerKey: any }) {
  if (!runnerKey) {
    return (
      <div className="flex flex-col gap-6">
        <div className="border border-border-custom border-dashed p-24 text-center flex flex-col items-center gap-6 bg-white/[0.01]">
          <span className="technical-label opacity-40">No Arbiter key found.</span>
          <p className="text-muted text-sm max-w-sm">
            Keys are issued by admins. Visit <span className="text-foreground">#become-an-arbiter</span> on Discord to request one.
          </p>
          <Link href="/arbiter" className="text-sm font-bold border-b border-foreground pb-1">
            Read the Documentation &rarr;
          </Link>
        </div>
      </div>
    );
  }

  const dockerCmd = `docker run \\\n  -e WORKER_PRIVATE_KEY="<your-private-key>" \\\n  ghcr.io/jaymaart/chess-agents-arbiter:latest`;
  const nodeCmd = `git clone https://github.com/jaymaart/chess-agents-arbiter\ncd chess-agents-arbiter\nnpm install && npm run build\n\nWORKER_PRIVATE_KEY="<your-private-key>" node dist/index.js`;

  return (
    <div className="flex flex-col gap-8">

      {/* Pending notice */}
      {!runnerKey.trusted && !runnerKey.revokedAt && (
        <div className="flex items-start gap-3 border border-amber-400/20 bg-amber-400/5 p-5">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400/90 text-sm font-bold mb-1">Awaiting admin approval</p>
            <p className="text-amber-400/60 text-xs leading-relaxed">
              Your key exists but hasn&apos;t been marked trusted yet. Once an admin approves it, your node will start receiving match jobs automatically.
            </p>
          </div>
        </div>
      )}

      {/* Revoked notice */}
      {runnerKey.revokedAt && (
        <div className="flex items-start gap-3 border border-red-400/20 bg-red-400/5 p-5">
          <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400/90 text-sm font-bold mb-1">Key revoked</p>
            <p className="text-red-400/60 text-xs">
              Revoked on {new Date(runnerKey.revokedAt).toLocaleDateString()}. Contact an admin to have a new key issued.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div>
        <div className="technical-label mb-4">Overview</div>
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-border-custom p-5 flex flex-col gap-2">
            <span className="technical-label opacity-50">Status</span>
            <div className="font-bold"><StatusBadge runnerKey={runnerKey} /></div>
          </div>
          <div className="border border-border-custom p-5 flex flex-col gap-2">
            <span className="technical-label opacity-50">Bouts Resolved</span>
            <div className="flex items-center gap-2 text-2xl font-bold font-mono">
              <Zap size={16} className="text-muted" />
              {runnerKey.jobsProcessed ?? 0}
            </div>
          </div>
          <div className="border border-border-custom p-5 flex flex-col gap-2">
            <span className="technical-label opacity-50">Key Issued</span>
            <span className="text-sm text-muted">
              {new Date(runnerKey.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      {/* Public Key */}
      <div className="border border-border-custom">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-custom bg-white/[0.01]">
          <span className="technical-label">Public Key — Arbiter Identity</span>
          <CopyButton text={runnerKey.publicKey} />
        </div>
        <div className="p-5">
          <pre className="text-xs text-muted font-mono whitespace-pre-wrap break-all leading-relaxed">
            {runnerKey.publicKey}
          </pre>
          <p className="text-xs text-muted/40 mt-4">
            Engine payloads are RSA-4096 encrypted to this key — only your private key can decrypt them.
          </p>
        </div>
      </div>

      {/* Run Configuration — only show when trusted */}
      {runnerKey.trusted && (
        <div className="border border-border-custom">
          <div className="px-5 py-3 border-b border-border-custom bg-white/[0.01]">
            <span className="technical-label">Run Configuration</span>
          </div>
          <div className="p-5 flex flex-col gap-8">

            {/* Env vars */}
            <div>
              <div className="technical-label opacity-50 mb-3">Environment Variables</div>
              <div className="border border-border-custom text-sm">
                <div className="grid grid-cols-[180px_1fr_80px] bg-white/[0.02] border-b border-border-custom">
                  <div className="px-4 py-2 technical-label opacity-40">Variable</div>
                  <div className="px-4 py-2 technical-label opacity-40 border-l border-border-custom">Value</div>
                  <div className="px-4 py-2 technical-label opacity-40 border-l border-border-custom">Required</div>
                </div>
                {[
                  { name: "WORKER_PRIVATE_KEY", value: "Your RSA-4096 private key PEM — shown once at issuance", req: true },
                  { name: "API_URL", value: "https://chess-agents-api-production.up.railway.app", req: false },
                ].map((row) => (
                  <div key={row.name} className="grid grid-cols-[180px_1fr_80px] border-b border-border-custom last:border-b-0">
                    <div className="px-4 py-3 font-mono text-xs text-foreground">{row.name}</div>
                    <div className="px-4 py-3 text-xs text-muted border-l border-border-custom">{row.value}</div>
                    <div className={`px-4 py-3 text-xs border-l border-border-custom ${row.req ? "text-foreground" : "text-muted/40"}`}>
                      {row.req ? "Yes" : "No"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Docker */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="technical-label opacity-50">Docker (recommended)</div>
                <CopyButton text={`docker run \\\n  -e WORKER_PRIVATE_KEY="<your-private-key>" \\\n  ghcr.io/jaymaart/chess-agents-arbiter:latest`} />
              </div>
              <pre className="bg-black border border-border-custom p-4 text-xs text-muted font-mono overflow-x-auto">{dockerCmd}</pre>
            </div>

            {/* Node */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="technical-label opacity-50">Node.js</div>
                <CopyButton text={nodeCmd} />
              </div>
              <pre className="bg-black border border-border-custom p-4 text-xs text-muted font-mono overflow-x-auto">{nodeCmd}</pre>
            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-6 text-xs text-muted">
        <Link href="/arbiter" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ExternalLink size={11} /> Full Documentation
        </Link>
        <a
          href="https://github.com/jaymaart/chess-agents-arbiter"
          target="_blank"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ExternalLink size={11} /> Source Code
        </a>
      </div>

    </div>
  );
}
