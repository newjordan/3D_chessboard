"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Shield, Code, Clock, Zap } from "lucide-react";
import Link from "next/link";
import { submitEngine } from "./actions";

export default function SubmitPage() {
  const { data: session, status } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [engineName, setEngineName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

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
    setUploadStatus("idle");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", engineName);

      const result = await submitEngine(formData);
      
      if (result.success) {
        setUploadStatus("success");
      } else {
        setErrorMsg(result.error || "Upload failed");
        setUploadStatus("error");
      }
    } catch (err: any) {
      setUploadStatus("error");
      setErrorMsg(err.message || "Failed to upload engine. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  if (status === "loading") return null;

  if (!session) {
    return (
      <div className="container mx-auto px-4 pt-20 flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
          <AlertCircle size={40} className="text-accent" />
        </div>
        <h1 className="text-4xl font-bold">Authentication Required</h1>
        <p className="text-white/60 max-w-md">
          You must be signed in to submit an engine to the ladder. 
          We use GitHub for identity to track engine ownership.
        </p>
        <button 
          onClick={() => window.location.href = "/api/auth/signin"}
          className="px-8 py-3 rounded-full bg-accent text-background font-bold hover:scale-105 transition-transform"
        >
          Sign In with GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 max-w-4xl pt-10 pb-20">
      <div className="flex flex-col gap-10">
        <div>
          <h1 className="text-4xl font-extrabold mb-4">Submit Your <span className="gold-gradient">Engine</span></h1>
          <p className="text-white/60">Upload a single .js or .py agent file. Reads FEN from stdin, outputs a move. Max 1MB.</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-10">
          {/* Rules / Sidebar */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="glass p-6 rounded-3xl border border-white/5 flex flex-col gap-4">
              <h3 className="font-bold flex items-center gap-2">
                <Shield size={18} className="text-accent" /> Submission Rules
              </h3>
              <ul className="text-sm text-white/50 space-y-3">
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> Single .js or .py file</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> Max file size: 1 MiB</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> No external dependencies</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> No network access</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> No filesystem writes</li>
              </ul>
            </div>

            <div className="glass p-6 rounded-3xl border border-white/5 flex flex-col gap-4">
              <h3 className="font-bold flex items-center gap-2">
                <Code size={18} className="text-accent" /> How It Works
              </h3>
              <div className="text-sm text-white/50 space-y-3">
                <p>Your agent is a script that plays chess one move at a time:</p>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Receives a FEN string via <span className="text-white/70 font-mono">stdin</span></li>
                  <li>Outputs a UCI move via <span className="text-white/70 font-mono">stdout</span></li>
                </ol>
                <p className="text-xs text-white/30 pt-1">Example: input <span className="font-mono text-white/40">rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1</span> → output <span className="font-mono text-white/40">e2e4</span></p>
              </div>
            </div>

            <div className="glass p-6 rounded-3xl border border-white/5 flex flex-col gap-4">
              <h3 className="font-bold flex items-center gap-2">
                <Clock size={18} className="text-accent" /> Limits
              </h3>
              <ul className="text-sm text-white/50 space-y-3">
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> 5 seconds per move</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> 256 MB memory</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> 1 CPU core</li>
                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" /> Timeout or illegal move = forfeit</li>
              </ul>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            {uploadStatus === "success" ? (
              <div className="glass p-10 rounded-[2rem] border border-accent/20 flex flex-col items-center text-center gap-6 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center">
                  <CheckCircle2 size={48} className="text-accent" />
                </div>
                <div className="flex flex-col gap-2">
                  <h2 className="text-2xl font-bold">Submission Received!</h2>
                  <p className="text-white/60">
                    Your engine <strong>{engineName}</strong> is now in the validation queue. 
                    We&apos;ll run some smoke tests and notify you shortly.
                  </p>
                </div>
                <div className="flex gap-4">
                  <Link href="/dashboard" className="px-6 py-2 rounded-full glass hover:bg-white/10 transition-colors text-sm font-bold">
                    My Dashboard
                  </Link>
                  <button 
                    onClick={() => setUploadStatus("idle")}
                    className="px-6 py-2 rounded-full border border-accent/20 text-accent hover:bg-accent/5 transition-colors text-sm font-bold"
                  >
                    Submit Another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-8">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold uppercase tracking-widest text-white/40">Engine Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. MySuperChess v1.0"
                    value={engineName}
                    onChange={(e) => setEngineName(e.target.value)}
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 focus:outline-none focus:border-accent/40 transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold uppercase tracking-widest text-white/40">Agent File (.js or .py)</label>
                  <div className="relative group">
                    <input
                      type="file"
                      accept=".js,.py"
                      onChange={handleFileChange}
                      required
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                    <div className={`w-full h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all ${file ? 'border-accent bg-accent/5' : 'border-white/10 bg-white/5 group-hover:border-white/20'}`}>
                      {file ? (
                        <>
                          <FileText size={48} className="text-accent" />
                          <div className="text-center">
                            <p className="font-bold">{file.name}</p>
                            <p className="text-xs text-white/40">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload size={48} className="text-white/20 group-hover:text-white/40 transition-colors" />
                          <div className="text-center">
                            <p className="font-bold">Drop your .js or .py file here</p>
                            <p className="text-xs text-white/40">or click to browse</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {errorMsg && <p className="text-red-400 text-sm flex items-center gap-1"><AlertCircle size={14} /> {errorMsg}</p>}
                </div>

                <button 
                  type="submit"
                  disabled={isUploading || !file || !engineName}
                  className="w-full py-5 rounded-2xl bg-accent text-background font-extrabold text-xl flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:scale-100 shadow-[0_0_40px_rgba(212,175,55,0.2)]"
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={24} className="animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={24} />
                      Complete Submission
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
