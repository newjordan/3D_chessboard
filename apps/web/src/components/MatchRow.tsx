"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface MatchRowProps {
  match: any;
  engineName: string;
}

export function MatchRow({ match, engineName }: MatchRowProps) {
  const router = useRouter();

  const opponentName = match.role === 'challenger' ? match.defenderEngine?.name : match.challengerEngine?.name;
  const opponentSlug = match.role === 'challenger' ? match.defenderEngine?.slug : match.challengerEngine?.slug;
  const opponentOwner = match.role === 'challenger' ? match.defenderEngine?.owner : match.challengerEngine?.owner;

  const handleRowClick = () => {
    router.push(`/matches/${match.id}`);
  };

  const challengerScore = Number(match.challengerScore || 0);
  const defenderScore = Number(match.defenderScore || 0);
  const myScore = match.role === 'challenger' ? challengerScore : defenderScore;
  const theirScore = match.role === 'challenger' ? defenderScore : challengerScore;

  return (
    <div 
      onClick={handleRowClick}
      className="flex items-center justify-between py-4 sm:py-6 border-b border-border-custom hover:bg-white/[0.02] transition-colors group cursor-pointer gap-3"
    >
      <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
        <span className="technical-label opacity-30 text-[10px] w-10 sm:w-12 shrink-0 hidden sm:block">
          {new Date(match.completedAt || match.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm font-medium min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`truncate ${match.role === 'challenger' ? 'font-bold' : ''}`}>{engineName}</span>
            {match.status === 'running' && (
              <span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 animate-pulse">
                <span className="w-1 h-1 rounded-full bg-accent" />
                <span className="text-[8px] font-bold text-accent uppercase tracking-tighter">Live</span>
              </span>
            )}
            {match.status === 'queued' && (
              <span className="px-1.5 py-0.5 border border-border-custom bg-white/[0.02] text-[8px] font-bold opacity-40 uppercase tracking-tighter">
                Queued
              </span>
            )}
          </div>
          <span className="hidden sm:inline opacity-20 italic shrink-0">vs</span>
          <div className="flex items-center gap-2 min-w-0">
            <Link 
              href={`/engines/${opponentSlug}`}
              className="hover:underline text-accent/80 hover:text-accent transition-colors relative z-10 flex items-center gap-2 min-w-0"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              {opponentOwner?.image && <img src={opponentOwner.image} alt="" className="w-3.5 h-3.5 rounded-full border border-white/5 shrink-0" />}
              <span className="truncate">{opponentName}</span>
            </Link>
            <span 
              className="text-[9px] technical-label opacity-40 lowercase group-hover:opacity-100 transition-opacity shrink-0 hidden sm:inline cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = `/users/${opponentOwner?.username}`;
              }}
            >
              @{opponentOwner?.username}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6 shrink-0">
        {match.status === 'completed' && match.eloDelta != null && (
          <span className={`font-mono text-[11px] font-bold w-12 text-right hidden sm:block ${
            match.eloDelta > 0 ? 'text-accent' : match.eloDelta < 0 ? 'text-red-400' : 'opacity-30'
          }`}>
            {match.eloDelta > 0 ? '+' : ''}{match.eloDelta}
          </span>
        )}
        <div className="font-mono text-sm font-bold flex gap-1">
          {match.status === 'completed' ? (
            <>
              <span className={myScore > theirScore ? 'text-accent' : (myScore < theirScore ? 'text-red-800' : 'opacity-40')}>
                {myScore}
              </span>
              <span className="opacity-20">-</span>
              <span className={theirScore > myScore ? 'text-accent' : (theirScore < myScore ? 'text-red-800' : 'opacity-40')}>
                {theirScore}
              </span>
            </>
          ) : (
            <span className="text-[10px] technical-label opacity-20 uppercase tracking-widest italic">In Progress</span>
          )}
        </div>
        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hidden sm:block" />
      </div>
    </div>
  );
}
