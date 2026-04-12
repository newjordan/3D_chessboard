import Link from 'next/link';
import { Play } from 'lucide-react';

interface ReplayButtonProps {
  matchId: string;
}

export const ReplayButton: React.FC<ReplayButtonProps> = ({ matchId }) => {
  return (
    <Link 
      href={`/matches/${matchId}/replay`}
      className="w-full py-4 bg-accent text-accent-foreground font-bold text-xs uppercase tracking-widest hover:brightness-110 hover:scale-[1.02] transition-all flex items-center justify-center gap-3 shadow-lg shadow-accent/20"
    >
      <Play size={16} fill="currentColor" /> Watch 3D Replay
    </Link>
  );
};
