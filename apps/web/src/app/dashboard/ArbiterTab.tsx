"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Copy, Check, CheckCircle, XCircle, Clock,
  Zap, AlertTriangle, ExternalLink, Send, Terminal, X,
} from "lucide-react";
import { ApiClient } from "@/lib/apiClient";

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

function RequestForm({ userId, onSubmitted }: { userId: string; onSubmitted: (req: any) => void }) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const req = await ApiClient.submitRunnerKeyRequest(userId, note || undefined);
      onSubmitted(req);
    } catch (err: any) {
      setError(err.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="technical-label opacity-50">
          Note for admins <span className="normal-case opacity-60">(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Tell us a bit about yourself or your setup — not required but helpful."
          rows={3}
          className="bg-background border border-border-custom text-foreground text-sm px-4 py-3 resize-none focus:outline-none focus:border-foreground/30 placeholder:text-muted/40 font-mono"
        />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-foreground text-background text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Send size={13} />
          {submitting ? "Submitting..." : "Request Arbiter Key"}
        </button>
      </div>
    </form>
  );
}

function OneTimeKeyModal({ privateKey, userId, onDone }: { privateKey: string; userId: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = async () => {
    setClearing(true);
    try {
      await ApiClient.acknowledgeRunnerKey(userId);
    } finally {
      onDone();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border-custom max-w-xl w-full flex flex-col gap-6 p-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Terminal size={18} className="text-accent" />
            <div>
              <h3 className="text-foreground font-bold text-base">Your Arbiter Private Key</h3>
              <p className="text-xs text-muted mt-0.5">Issued by an admin — shown once only</p>
            </div>
          </div>
        </div>

        <div className="border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-red-400 text-sm font-semibold">This is the only time your private key will be shown.</p>
          <p className="text-red-300/60 text-xs mt-1">Copy it now and store it securely. It cannot be recovered.</p>
        </div>

        <div className="relative">
          <pre className="bg-black border border-border-custom p-4 text-accent text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
            {privateKey}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-3 right-3 p-1.5 bg-white/5 hover:bg-white/10 border border-border-custom text-muted hover:text-foreground transition-colors"
          >
            {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
          </button>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 accent-current"
          />
          <span className="text-muted text-sm">I have copied and securely stored my private key</span>
        </label>

        <button
          onClick={handleDone}
          disabled={!confirmed || clearing}
          className="w-full py-3 bg-foreground text-background font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Done — Close
        </button>
      </div>
    </div>
  );
}

export function ArbiterTab({
  runnerKey: initialRunnerKey,
  runnerKeyRequest: initialRequest,
  userId,
}: {
  runnerKey: any;
  runnerKeyRequest: any;
  userId: string;
}) {
  const [request, setRequest] = useState(initialRequest);
  const [runnerKey, setRunnerKey] = useState(initialRunnerKey);

  const dockerCmd = `docker run \\\n  -e WORKER_PRIVATE_KEY="<your-private-key>" \\\n  ghcr.io/jaymaart/chess-agents-arbiter:latest`;
  const nodeCmd = `git clone https://github.com/jaymaart/chess-agents-arbiter\ncd chess-agents-arbiter\nnpm install && npm run build\n\nWORKER_PRIVATE_KEY="<your-private-key>" node dist/index.js`;

  // One-time key modal — shown if admin has issued the key but user hasn't acknowledged yet
  if (runnerKey?.privateKeyOnce) {
    return (
      <OneTimeKeyModal
        privateKey={runnerKey.privateKeyOnce}
        userId={userId}
        onDone={() => setRunnerKey({ ...runnerKey, privateKeyOnce: null })}
      />
    );
  }

  // No key — show request form or pending/rejected state
  if (!runnerKey) {
    return (
      <div className="flex flex-col gap-8 max-w-2xl">

        {/* Pending */}
        {request?.status === "pending" && (
          <div className="flex items-start gap-3 border border-amber-400/20 bg-amber-400/5 p-5">
            <Clock size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400/90 text-sm font-bold mb-1">Request pending</p>
              <p className="text-amber-400/60 text-xs leading-relaxed">
                Your request was submitted on{" "}
                {new Date(request.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
                An admin will review it and generate your key. You&apos;ll see it here once issued.
              </p>
              {request.note && (
                <p className="text-amber-400/40 text-xs mt-2 italic">&ldquo;{request.note}&rdquo;</p>
              )}
            </div>
          </div>
        )}

        {/* Rejected */}
        {request?.status === "rejected" && (
          <div className="flex items-start gap-3 border border-red-400/20 bg-red-400/5 p-5">
            <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400/90 text-sm font-bold mb-1">Request not approved</p>
              <p className="text-red-400/60 text-xs leading-relaxed">
                Your previous request was not approved. You may submit a new one below, or reach out on Discord.
              </p>
            </div>
          </div>
        )}

        {/* No request yet, or rejected (show form) */}
        {(!request || request.status === "rejected") && (
          <div className="border border-border-custom">
            <div className="px-5 py-3 border-b border-border-custom bg-white/[0.01]">
              <span className="technical-label">Request an Arbiter Key</span>
            </div>
            <div className="p-5 flex flex-col gap-5">
              <p className="text-muted text-sm leading-relaxed">
                Arbiter keys are issued by admins. Submit a request here and you&apos;ll be notified once it&apos;s ready.
                You can also reach out directly in the{" "}
                <span className="text-foreground">#become-an-arbiter</span> Discord channel.
              </p>
              <RequestForm userId={userId} onSubmitted={(req) => setRequest(req)} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-6 text-xs text-muted pt-2">
          <Link href="/arbiter" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ExternalLink size={11} /> Documentation
          </Link>
          <a href="https://github.com/jaymaart/chess-agents-arbiter" target="_blank" className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ExternalLink size={11} /> Source Code
          </a>
        </div>
      </div>
    );
  }

  // Has a key
  return (
    <div className="flex flex-col gap-8">

      {/* Pending trust notice */}
      {!runnerKey.trusted && !runnerKey.revokedAt && (
        <div className="flex items-start gap-3 border border-amber-400/20 bg-amber-400/5 p-5">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400/90 text-sm font-bold mb-1">Awaiting admin approval</p>
            <p className="text-amber-400/60 text-xs leading-relaxed">
              Your key has been issued but hasn&apos;t been marked trusted yet. Once an admin approves it,
              your node will start receiving match jobs automatically.
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

      {/* Overview */}
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
        <div className="flex items-center gap-3 pt-1">
          <span className="technical-label opacity-30">Match types:</span>
          <span className="technical-label text-accent">Rating</span>
          {runnerKey.canRunPlacements && (
            <span className="technical-label text-accent">Placement</span>
          )}
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

      {/* Run Configuration — only when trusted */}
      {runnerKey.trusted && (
        <div className="border border-border-custom">
          <div className="px-5 py-3 border-b border-border-custom bg-white/[0.01]">
            <span className="technical-label">Run Configuration</span>
          </div>
          <div className="p-5 flex flex-col gap-8">

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
                  <div key={row.name} className="grid grid-cols-[180px_1fr_80px] border-t border-border-custom">
                    <div className="px-4 py-3 font-mono text-xs text-foreground">{row.name}</div>
                    <div className="px-4 py-3 text-xs text-muted border-l border-border-custom">{row.value}</div>
                    <div className={`px-4 py-3 text-xs border-l border-border-custom ${row.req ? "text-foreground" : "text-muted/40"}`}>
                      {row.req ? "Yes" : "No"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="technical-label opacity-50">Docker (recommended)</div>
                <CopyButton text={`docker run \\\n  -e WORKER_PRIVATE_KEY="<your-private-key>" \\\n  ghcr.io/jaymaart/chess-agents-arbiter:latest`} />
              </div>
              <pre className="bg-black border border-border-custom p-4 text-xs text-muted font-mono overflow-x-auto">{dockerCmd}</pre>
            </div>

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

      <div className="flex items-center gap-6 text-xs text-muted">
        <Link href="/arbiter" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ExternalLink size={11} /> Documentation
        </Link>
        <a href="https://github.com/jaymaart/chess-agents-arbiter" target="_blank" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ExternalLink size={11} /> Source Code
        </a>
      </div>

    </div>
  );
}
