"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Trash2, TrendingUp, History, Info, Loader2, ChevronRight } from "lucide-react";
import { deleteEngine } from "../app/dashboard/actions";

interface EngineCardProps {
  engine: any;
}

export function EngineCard({ engine }: EngineCardProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete ${engine.name}? If it has played games, it will be disabled. If not, it will be permanently removed.`)) {
      startTransition(async () => {
        const result = await deleteEngine(engine.id);
        if (!result.success) {
          alert(result.error);
        }
      });
    }
  };

  const latestVersion = engine.versions?.[0];

  return (
    <div
      className={`border border-border-custom bg-white/[0.01] p-8 flex flex-col gap-8 transition-all relative hover:bg-white/[0.02] ${
        isPending ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <Link href={`/engines/${engine.slug}`} className="text-xl font-bold hover:underline tracking-tight">
            {engine.name}
          </Link>
          <span className="technical-label opacity-40 text-[9px] lowercase">{engine.id.substring(0, 16)}</span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {engine.status === 'pending' && <Loader2 size={10} className="animate-spin text-accent" />}
            <span className={`technical-label px-2 py-0.5 border border-border-custom flex items-center gap-1.5 ${
              engine.status === 'active' ? 'text-accent' : (engine.status === 'pending' ? 'text-accent/60' : 'text-muted')
            }`}>
              {engine.status === 'pending' && <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />}
              {engine.status === 'pending' ? 'validating' : engine.status}
            </span>
          </div>
          {(Number(engine._count?.matchesChallenged || 0) + Number(engine._count?.matchesDefended || 0)) > 0 && (
            <div className="flex items-center gap-1.5 technical-label text-[9px] text-accent font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping duration-1000" />
              SIMULATING MATCH...
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-y-6">
        <div className="flex flex-col gap-1">
          <span className="technical-label text-[9px] opacity-40">Rating</span>
          <span className="font-mono text-lg font-bold tabular-nums">{engine.currentRating}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="technical-label text-[9px] opacity-40">Games</span>
          <span className="font-mono text-lg font-bold tabular-nums">{engine.gamesPlayed}</span>
        </div>
      </div>

      {latestVersion && (
        <div className="border-t border-border-custom pt-6 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="technical-label text-[9px] opacity-40">Build Integrity</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider ${
              latestVersion.validationStatus === 'passed' ? 'text-accent' : 'text-red-800'
            }`}>
              {latestVersion.validationStatus}
            </span>
          </div>
          {latestVersion.validationNotes && (
            <p className="text-[10px] text-muted italic line-clamp-2">
              &quot;{latestVersion.validationNotes}&quot;
            </p>
          )}
        </div>
      )}

      <div className="mt-2 border-t border-border-custom pt-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href={`/engines/${engine.slug}`}
            className="technical-label text-[10px] hover:text-accent transition-colors flex items-center gap-1"
          >
            History <ChevronRight size={10} />
          </Link>
        </div>
        
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="p-1 text-muted hover:text-red-700 transition-colors"
          title="Delete Engine"
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  );
}
