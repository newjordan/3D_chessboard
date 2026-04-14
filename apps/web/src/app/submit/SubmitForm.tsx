"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { FileText, CheckCircle2, AlertCircle, Loader2, Copy, Check, Upload, RefreshCw, Terminal, XCircle, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { submitEngine } from "./actions";
import { ApiClient } from "@/lib/apiClient";

const AGENT_PROMPT = `Build me a chess agent as a single file (.js for Node.js or .py for Python 3).

Requirements:
- Read a single FEN string from stdin (one line)
- Output a single UCI move to stdout (e.g. "e2e4") and exit
- The move MUST be legal for the given position
- You have 5 seconds per move, 256MB memory, 1 CPU core
- Standard libraries like 'math', 'random', 'sys', and 'readline' are ALLOWED.
- NO 'fs', NO 'child_process', NO network access (for security).

The agent will be called once per move with the board state as a FEN string. It should analyze the position and print the best move in UCI notation (e.g. "e2e4", "g1f3", "e7e8q" for promotion).

Tip: For best performance, DO NOT exit your script between moves. Our worker will reuse your process if it stays alive!

Node.js Example (use 'readline', NOT 'fs'):
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (fen) => {
  // your logic here...
  process.stdout.write("e2e4\n");
});`;

type SubmissionPhase = "form" | "validating" | "passed" | "failed";

interface ValidationState {
  submissionId: string;
  engineSlug: string;
  phase: SubmissionPhase;
  validationNotes: string | null;
  uciName: string | null;
  pollCount: number;
}

export function SubmitForm() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [engineName, setEngineName] = useState("");
  const [model, setModel] = useState("Claude Sonnet 4.6");
  const [customModel, setCustomModel] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const [submissionType, setSubmissionType] = useState<"new" | "update">("new");
  const [userEngines, setUserEngines] = useState<any[]>([]);
  const [selectedEngineId, setSelectedEngineId] = useState("");
  const [division, setDivision] = useState<"open" | "js" | "python" | "lite">("open");

  const DIVISIONS = [
    { value: "open", label: "Open", desc: "Any language, any size. Default arena." },
    { value: "js", label: "JS Only", desc: "JavaScript engines only (.js files)." },
    { value: "python", label: "Python Only", desc: "Python engines only (.py files)." },
    { value: "lite", label: "Lite (< 200KB)", desc: "Either language, file must be under 200KB." },
  ] as const;

  const [validation, setValidation] = useState<ValidationState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const models = [
    "Claude Sonnet 4.6",
    "Claude Opus 4.6",
    "GPT-5.4",
    "GPT-5.4 Pro",
    "Gemini 3.1 Pro",
    "Gemini 3 Flash",
    "Muse Spark",
    "Other"
  ];

  useEffect(() => {
    if (session?.user) {
      const userId = (session.user as any).id;
      ApiClient.getEnginesByOwner(userId)
        .then(engines => setUserEngines(engines || []))
        .catch(() => setUserEngines([]));
    }
  }, [session]);

  // Persistence logic for the OAuth redirect flow
  useEffect(() => {
    const savedName = localStorage.getItem("draft_engine_name");
    const savedModel = localStorage.getItem("draft_engine_model");
    if (savedName) setEngineName(savedName);
    if (savedModel) setModel(savedModel);
  }, []);

  useEffect(() => {
    if (engineName) localStorage.setItem("draft_engine_name", engineName);
    if (model) localStorage.setItem("draft_engine_model", model);
  }, [engineName, model]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (submissionId: string, engineSlug: string) => {
    setValidation({
      submissionId,
      engineSlug,
      phase: "validating",
      validationNotes: null,
      uciName: null,
      pollCount: 0,
    });

    pollRef.current = setInterval(async () => {
      setValidation(prev => prev ? { ...prev, pollCount: prev.pollCount + 1 } : prev);

      try {
        const data = await ApiClient.getSubmissionStatus(submissionId);
        const vs = data.version?.validationStatus;

        if (vs === "passed" || vs === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          
          setValidation(prev => {
            if (!prev) return prev;
            return { 
              ...prev, 
              phase: vs as SubmissionPhase, 
              uciName: data.version?.uciName,
              validationNotes: data.version?.validationNotes
            };
          });
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(AGENT_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      if (ext !== "js" && ext !== "py") {
        setErrorMsg("Only .js and .py files are accepted.");
        setFile(null);
        return;
      }
      if (selectedFile.size > 1024 * 1024) {
        setErrorMsg("File too large. Maximum size is 1MB.");
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setErrorMsg("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !engineName) return;

    setIsUploading(true);
    setErrorMsg("");

    try {
      const finalModel = model === "Other" ? customModel : model;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", engineName);
      formData.append("generationModel", finalModel);
      formData.append("division", division);
      if (submissionType === "update" && selectedEngineId) {
        formData.append("engineId", selectedEngineId);
      }

      const result = await submitEngine(formData);

      if (result.success) {
        startPolling(result.submissionId, result.engineSlug);
      } else {
        setErrorMsg(result.error || "Upload failed");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to upload engine. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleReupload = () => {
    // Preserve all state (engineName, model, ids) except for the file itself
    setFile(null);
    setErrorMsg("");
    if (pollRef.current) clearInterval(pollRef.current);
    setValidation(null);
  };

  const handleNewSubmission = () => {
    setFile(null);
    setEngineName("");
    setModel("Claude Sonnet 4.6");
    setCustomModel("");
    setErrorMsg("");
    if (pollRef.current) clearInterval(pollRef.current);
    setValidation(null);
  };

  if (status === "loading") return null;

  if (validation) {
    return (
      <div className="container mx-auto px-6 py-16 max-w-3xl flex flex-col gap-12 text-white min-h-screen">
        <div className="flex flex-col gap-6">
          <div className="technical-label">V.03 / Validation Pipeline</div>
          <h1 className="text-5xl font-bold tracking-tight">{engineName}</h1>
          <p className="text-muted text-sm text-white/60">
            Monitoring real-time validation status for your submission.
          </p>
        </div>

        <div className="border border-border-custom soft-shadow bg-white/[0.01] flex flex-col">
          <div className="flex flex-col divide-y divide-border-custom">
            {/* Step 1: Upload */}
            <div className="flex items-center gap-4 p-6">
              <div className="w-8 h-8 rounded-full border border-accent bg-accent/10 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} className="text-accent" />
              </div>
              <div className="flex-1">
                <span className="font-bold text-sm">Binary Uploaded</span>
                <span className="technical-label text-[10px] opacity-40 ml-3">COMPLETE</span>
              </div>
              <span className="text-accent text-[10px] font-mono font-bold">✓</span>
            </div>

            {/* Step 2: Queued */}
            <div className="flex items-center gap-4 p-6">
              <div className="w-8 h-8 rounded-full border border-accent bg-accent/10 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} className="text-accent" />
              </div>
              <div className="flex-1">
                <span className="font-bold text-sm">Validation Job Queued</span>
                <span className="technical-label text-[10px] opacity-40 ml-3">COMPLETE</span>
              </div>
              <span className="text-accent text-[10px] font-mono font-bold">✓</span>
            </div>

            {/* Step 3: Sandbox Probe */}
            <div className="flex items-center gap-4 p-6">
              {validation.phase === "validating" ? (
                <div className="w-8 h-8 rounded-full border border-accent/40 flex items-center justify-center shrink-0 animate-pulse">
                  <Loader2 size={14} className="text-accent animate-spin" />
                </div>
              ) : validation.phase === "passed" ? (
                <div className="w-8 h-8 rounded-full border border-accent bg-accent/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-accent" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full border border-red-500/40 bg-red-500/10 flex items-center justify-center shrink-0">
                  <XCircle size={14} className="text-red-500" />
                </div>
              )}
              <div className="flex-1">
                <span className="font-bold text-sm">Sandbox Probe</span>
                <span className={`technical-label text-[10px] ml-3 ${
                  validation.phase === "validating" ? "text-accent animate-pulse" :
                  validation.phase === "passed" ? "opacity-40" : "text-red-400"
                }`}>
                  {validation.phase === "validating" ? "RUNNING..." :
                   validation.phase === "passed" ? "COMPLETE" : "FAILED"}
                </span>
              </div>
              {validation.phase === "validating" && (
                <span className="text-[10px] font-mono opacity-30">{validation.pollCount * 2}s</span>
              )}
              {validation.phase === "passed" && (
                <span className="text-accent text-[10px] font-mono font-bold">✓</span>
              )}
              {validation.phase === "failed" && (
                <span className="text-red-500 text-[10px] font-mono font-bold">✗</span>
              )}
            </div>

            {/* Step 4: Arena Registration */}
            <div className="flex items-center gap-4 p-6">
              {validation.phase === "passed" ? (
                <div className="w-8 h-8 rounded-full border border-accent bg-accent/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-accent" />
                </div>
              ) : (
                <div className={`w-8 h-8 rounded-full border border-border-custom flex items-center justify-center shrink-0 ${validation.phase === "failed" ? "opacity-20" : "opacity-40"}`}>
                  <span className="text-[10px] font-mono opacity-40">04</span>
                </div>
              )}
              <div className="flex-1">
                <span className={`font-bold text-sm ${validation.phase !== "passed" && validation.phase !== "failed" ? "opacity-40" : ""} ${validation.phase === "failed" ? "opacity-20" : ""}`}>
                  Arena Registration
                </span>
                {validation.phase === "passed" && (
                  <span className="technical-label text-[10px] opacity-40 ml-3">COMPLETE</span>
                )}
              </div>
              {validation.phase === "passed" && (
                <span className="text-accent text-[10px] font-mono font-bold">✓</span>
              )}
            </div>
          </div>

          {/* Result Panel */}
          {validation.phase === "failed" && validation.validationNotes && (
            <div className="border-t border-border-custom p-6 bg-red-950/10">
              <div className="flex items-center gap-2 mb-3">
                <Terminal size={12} className="text-red-400" />
                <span className="technical-label text-[10px] text-red-400">VALIDATION_ERROR.LOG</span>
              </div>
              <pre className="font-mono text-[11px] text-red-200/70 whitespace-pre-wrap leading-relaxed bg-black/40 p-4 border border-red-900/20 rounded">
                {validation.validationNotes}
              </pre>
            </div>
          )}

          {validation.phase === "passed" && validation.uciName && (
            <div className="border-t border-border-custom p-6 bg-accent/[0.03]">
              <div className="flex items-center gap-2 mb-2">
                <Terminal size={12} className="text-accent" />
                <span className="technical-label text-[10px] text-accent/60">UCI_HANDSHAKE</span>
              </div>
              <span className="font-mono text-sm font-bold">{validation.uciName}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {validation.phase === "passed" && (
            <>
              <Link
                href={`/engines/${validation.engineSlug}`}
                className="flex-1 py-4 bg-foreground text-background font-bold text-sm tracking-tight hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                View Agent Profile <ArrowRight size={14} />
              </Link>
              <button
                onClick={handleNewSubmission}
                className="flex-1 py-4 border border-border-custom font-bold text-sm tracking-tight hover:bg-white/[0.04] transition-all flex items-center justify-center gap-2"
              >
                Submit Another Agent
              </button>
            </>
          )}

          {validation.phase === "failed" && (
            <>
              <button
                onClick={handleReupload}
                className="flex-1 py-4 bg-transparent border border-red-500/30 text-red-100 font-bold text-[11px] tracking-widest uppercase hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 group"
              >
                Modify Code & Re-upload <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={handleNewSubmission}
                className="flex-1 py-4 border border-border-custom font-bold text-sm tracking-tight hover:bg-white/[0.04] transition-all flex items-center justify-center gap-2"
              >
                Start Fresh
              </button>
            </>
          )}

          {validation.phase === "validating" && (
            <div className="py-4 text-center technical-label opacity-30 text-xs w-full">
              Pipeline is running. This page auto-updates every 2 seconds.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-10 max-w-4xl flex flex-col gap-8 text-white min-h-screen">
      <div className="flex flex-col gap-3">
        <div className="technical-label">V.03 / Registration</div>
        <h1 className="text-3xl font-bold tracking-tight">Submit Agent</h1>
        {!session ? (
          <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg max-w-xl animate-in fade-in slide-in-from-left-2">
            <ShieldCheck size={16} className="text-accent shrink-0" />
            <p className="text-[11px] text-accent/80 leading-relaxed font-medium">
              You are currently viewing as a guest. You can prepare your submission now, but you'll need to sign in with GitHub to finalize it.
            </p>
          </div>
        ) : (
          <p className="text-muted max-w-xl leading-relaxed text-white/60">
            Upload a stateless agent. It should analyze a single board position and return its best move in under 5 seconds.
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-10">
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          <div className="flex flex-col gap-6">
            {userEngines.length > 0 && (
              <div className="flex flex-col gap-3">
                <label className="technical-label text-white/40">Submission Type</label>
                <div className="grid grid-cols-2 border border-border-custom p-1 bg-white/[0.02]">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionType("new");
                      setEngineName("");
                      setSelectedEngineId("");
                    }}
                    className={`py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${submissionType === 'new' ? 'bg-foreground text-background' : 'hover:bg-white/5 opacity-40'}`}
                  >
                    New Engine
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmissionType("update")}
                    className={`py-2 text-[10px] font-bold uppercase tracking-wider transition-all ${submissionType === 'update' ? 'bg-foreground text-background' : 'hover:bg-white/5 opacity-40'}`}
                  >
                    Update Existing
                  </button>
                </div>
              </div>
            )}

            {submissionType === "update" && (
              <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                <label className="technical-label text-white/40">Select Agent to Update</label>
                <select
                  value={selectedEngineId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedEngineId(id);
                    const engine = userEngines.find(eng => eng.id === id);
                    if (engine) setEngineName(engine.name);
                  }}
                  required
                  className="w-full bg-background border border-border-custom p-4 text-sm font-medium focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer text-white"
                >
                  <option value="" disabled className="bg-black">Choose an engine...</option>
                  {userEngines.map((eng) => (
                    <option key={eng.id} value={eng.id} className="bg-black">{eng.name} (Elo: {eng.currentRating})</option>
                  ))}
                </select>
              </div>
            )}

            {submissionType === "new" && (
              <div className="flex flex-col gap-3">
                <label className="technical-label text-white/40">Division</label>
                <div className="grid grid-cols-2 gap-2">
                  {DIVISIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDivision(d.value)}
                      className={`flex flex-col gap-1 p-3 border text-left transition-all ${
                        division === d.value
                          ? "border-accent bg-accent/10"
                          : "border-border-custom hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className={`font-bold text-[11px] uppercase tracking-wider ${division === d.value ? "text-accent" : "text-white/60"}`}>
                        {d.label}
                      </span>
                      <span className="text-[10px] text-white/30 leading-snug">{d.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {submissionType === "update" && selectedEngineId && (
              <div className="flex flex-col gap-1">
                <label className="technical-label text-white/40">Division</label>
                <p className="text-[11px] text-white/30 italic">
                  Division is locked to <span className="text-white/50 font-bold">
                    {DIVISIONS.find(d => d.value === (userEngines.find(e => e.id === selectedEngineId)?.division ?? "open"))?.label ?? "Open"}
                  </span> and cannot be changed.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="technical-label text-white/40">Engine Designation</label>
              <input
                type="text"
                placeholder="e.g. Pawnstorm Alpha"
                value={engineName}
                onChange={(e) => setEngineName(e.target.value)}
                required
                disabled={submissionType === "update"}
                maxLength={64}
                className="w-full bg-background border border-border-custom p-4 text-sm font-medium focus:outline-none focus:border-accent transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {submissionType === "update" && (
                <p className="text-[10px] opacity-40 italic mt-1 font-medium">Designation is locked for updates to maintain the engine handle.</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="technical-label text-white/40">Generator Model</label>
              <div className="flex flex-col gap-2">
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-background border border-border-custom p-4 text-sm font-medium focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer text-white"
                >
                  {models.map((m) => (
                    <option key={m} value={m} className="bg-black">{m}</option>
                  ))}
                </select>
                
                {model === "Other" && (
                  <input
                    type="text"
                    placeholder="Specify custom model..."
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    required={model === "Other"}
                    className="w-full bg-background border border-border-custom p-4 text-sm font-medium focus:outline-none focus:border-accent transition-colors text-white animate-in fade-in slide-in-from-top-2"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="technical-label text-white/40">Binary (.js or .py)</label>
              <div className="relative group">
                <input
                  type="file"
                  accept=".js,.py"
                  onChange={handleFileChange}
                  required
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div className={`w-full min-h-[120px] border border-dashed flex flex-col items-center justify-center gap-4 transition-all ${file ? 'border-accent bg-accent/5' : 'border-border-custom bg-white/[0.01] hover:bg-white/[0.03]'}`}>
                  {file ? (
                    <>
                      <FileText size={32} className="text-accent" />
                      <div className="text-center">
                        <p className="font-bold text-sm text-white">{file.name}</p>
                        <p className="technical-label text-[9px] text-white/40">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload size={32} className="opacity-10 text-white" />
                      <div className="text-center space-y-1">
                        <p className="font-bold text-sm text-white">Drop agent code here</p>
                        <p className="technical-label text-[9px] text-white/40">JS or Python / Max 1MB</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {errorMsg && <p className="mt-3 text-red-400 text-xs flex items-center gap-1 font-medium"><AlertCircle size={12} /> {errorMsg}</p>}
            </div>
          </div>

          {!session ? (
            <button
              type="button"
              onClick={() => signIn("github")}
              className="w-full py-4 bg-foreground text-background font-bold text-sm tracking-tight border-2 border-transparent hover:opacity-90 transition-all flex items-center justify-center gap-3"
            >
              <CheckCircle2 size={16} />
              Sign in with GitHub to Submit
            </button>
          ) : (
            <button
              type="submit"
              disabled={isUploading || !file || !engineName}
              className="w-full py-4 bg-foreground text-background font-bold text-sm tracking-tight border-2 border-transparent hover:opacity-90 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:border-neutral-700 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
            >
              {isUploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  Complete Submission
                </>
              )}
            </button>
          )}
          </form>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-custom pb-3 text-white/40">
              <span className="technical-label">Technical Spec</span>
              <button
                type="button"
                onClick={copyPrompt}
                className="technical-label flex items-center gap-1 hover:text-accent transition-colors"
              >
                {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            </div>
            <div className="bg-white/[0.02] border border-border-custom p-4">
              <div className="text-[11px] font-mono text-white/40 whitespace-pre-wrap leading-relaxed max-h-[250px] overflow-y-auto">
                {AGENT_PROMPT}
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-white/40 font-medium italic">
              Standard tournament rules apply. No late-binding evaluations or network egress allowed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
