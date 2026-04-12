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
      className="grid grid-cols-[1fr_80px] items-center py-6 border-b border-border-custom hover:bg-white/[0.02] transition-colors group cursor-pointer"
    >
      <div className="flex items-center gap-6">
        <span className="technical-label opacity-30 text-[10px] w-12">
          {new Date(match.completedAt || 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        
        <div className="flex items-center gap-4 text-sm font-medium">
          <span className={match.role === 'challenger' ? 'font-bold' : ''}>{engineName}</span>
          <span className="opacity-20 italic">vs</span>
          <Link 
            href={`/engines/${opponentSlug}`}
            className="hover:underline text-accent/80 hover:text-accent transition-colors relative z-10"
            onClick={(e) => {
              e.stopPropagation(); // Stay on engine profile
            }}
          >
            {opponentName}
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-end gap-6">
        <div className="font-mono text-sm font-bold flex gap-1">
          <span className={myScore > theirScore ? 'text-accent' : (myScore < theirScore ? 'text-red-800' : 'opacity-40')}>
            {myScore}
          </span>
          <span className="opacity-20">-</span>
          <span className={theirScore > myScore ? 'text-accent' : (theirScore < myScore ? 'text-red-800' : 'opacity-40')}>
            {theirScore}
          </span>
        </div>
        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted" />
      </div>
    </div>
  );
}
