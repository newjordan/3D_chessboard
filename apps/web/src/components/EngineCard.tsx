"use client";

import Link from "next/link";
import { TrendingUp, History, Info, Loader2, ChevronRight } from "lucide-react";

import { ApiClient } from "@/lib/apiClient";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface EngineCardProps {
  engine: any;
  isOwner?: boolean;
}

export function EngineCard({ engine, isOwner = false }: EngineCardProps) {
  const { data: session } = useSession();
  const [isToggling, setIsToggling] = useState(false);
  const router = useRouter();

  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const userId = (session?.user as any)?.id;
    if (!userId || !isOwner) return;

    setIsToggling(true);
    const targetStatus = engine.status === 'active' ? 'disabled_by_owner' : 'active';
    
    try {
      const resp = await ApiClient.updateEngineStatus(engine.id, targetStatus, userId);
      if (resp.success) {
        toast.success(`${engine.name} is now ${targetStatus === 'active' ? 'Online' : 'Paused'}`);
        router.refresh();
      } else {
        toast.error(resp.message || "Failed to update status");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred");
    } finally {
      setIsToggling(true); // Keep it loading until refresh
      // Reset after a bit if refresh is slow
      setTimeout(() => setIsToggling(false), 2000);
    }
  };
  const latestVersion = engine.versions?.[0];

  return (
    <div
      className="border border-border-custom bg-white/[0.01] p-8 flex flex-col gap-8 transition-all relative hover:bg-white/[0.02]"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          {engine.avatarUrl ? (
            <div className="w-12 h-12 rounded-lg border border-accent/20 overflow-hidden shadow-lg">
              <img src={engine.avatarUrl} alt={engine.name} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-lg border border-border-custom bg-white/5 flex items-center justify-center">
              <span className="text-[10px] technical-label opacity-20 italic">CPU</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Link href={`/engines/${engine.slug}`} className="text-xl font-bold hover:underline tracking-tight">
              {engine.name}
            </Link>
            <span className="technical-label opacity-40 text-[9px] lowercase">{engine.id.substring(0, 16)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {isOwner ? (
            <div className="flex flex-col items-end gap-1">
              <button 
                onClick={handleToggleStatus}
                disabled={isToggling || engine.status === 'pending'}
                className={`group relative flex items-center h-6 w-12 rounded-full transition-all duration-300 outline-none ${
                  engine.status === 'active' ? 'bg-accent/20 border border-accent/40' : 'bg-white/5 border border-white/10'
                } ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
              >
                <span className={`absolute left-1 h-4 w-4 rounded-full transition-all duration-300 flex items-center justify-center ${
                  engine.status === 'active' 
                    ? 'translate-x-6 bg-accent' 
                    : 'translate-x-0 bg-muted-foreground'
                }`}>
                  {isToggling && <Loader2 size={10} className="animate-spin text-black" />}
                </span>
              </button>
              <span className={`technical-label text-[8px] uppercase tracking-widest ${
                engine.status === 'active' ? 'text-accent' : 'text-muted-foreground'
              }`}>
                {engine.status === 'pending' ? 'initializing' : (engine.status === 'active' ? 'online' : 'paused')}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <div className={`h-4 w-4 rounded-full border ${
                engine.status === 'active' ? 'bg-accent/20 border-accent/40 animate-pulse' : 'bg-white/5 border-white/10'
              }`} />
              <span className={`technical-label text-[8px] uppercase tracking-widest ${
                engine.status === 'active' ? 'text-accent' : 'text-muted-foreground'
              }`}>
                {engine.status}
              </span>
            </div>
          )}
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
      </div>
    </div>
  );
}
