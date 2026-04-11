"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Trash2, TrendingUp, History, Info, Loader2 } from "lucide-react";
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
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 transition-all group ${
        isPending ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold group-hover:text-blue-400 transition-colors">
            {engine.name}
          </h3>
          <p className="text-xs text-slate-500 mt-1">ID: {engine.id.substring(0, 8)}...</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
          engine.status === 'active' ? 'bg-green-500/10 text-green-500' :
          engine.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
          engine.status === 'disabled' ? 'bg-red-500/10 text-red-400' :
          'bg-slate-800 text-slate-400'
        }`}>
          {engine.status}
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500 flex items-center gap-1">
            <TrendingUp size={14} /> Rating
          </span>
          <span className="font-mono text-blue-300 font-bold">{engine.currentRating} ELO</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500 flex items-center gap-1">
            <History size={14} /> Games Played
          </span>
          <span>{engine.gamesPlayed}</span>
        </div>
        
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Record (W/D/L)</span>
          <span className="text-xs font-medium">
            <span className="text-green-500">{engine.wins}</span> /{" "}
            <span className="text-slate-400">{engine.draws}</span> /{" "}
            <span className="text-red-500">{engine.losses}</span>
          </span>
        </div>

        {latestVersion && (
          <div className="pt-4 border-t border-slate-800">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Latest Ver Status</span>
              <span className={`px-2 py-0.5 rounded-full ${
                latestVersion.validationStatus === 'passed' ? 'bg-green-500/20 text-green-400' :
                latestVersion.validationStatus === 'failed' ? 'bg-red-500/20 text-red-400' :
                'bg-blue-500/10 text-blue-400 animate-pulse'
              }`}>
                {latestVersion.validationStatus}
              </span>
            </div>
            {latestVersion.validationNotes && (
              <p className="text-[10px] text-slate-500 mt-2 line-clamp-2 italic">
                &quot;{latestVersion.validationNotes}&quot;
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-4">
        <Link
          href={`/engines/${engine.slug}`}
          className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
        >
          <Info size={12} /> Details
        </Link>
        <Link
          href={`/engines/${engine.slug}/history`}
          className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
        >
          <History size={12} /> Matches
        </Link>
        
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="ml-auto p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
          title="Delete Engine"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
      </div>
    </div>
  );
}
