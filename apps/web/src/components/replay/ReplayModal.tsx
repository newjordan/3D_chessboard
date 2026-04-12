"use client";

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ReplayController } from './ReplayController';
import { ApiClient } from '@/lib/apiClient';

interface ReplayModalProps {
  matchId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ReplayModal: React.FC<ReplayModalProps> = ({ matchId, isOpen, onClose }) => {
  const [pgn, setPgn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      ApiClient.getMatchPgn(matchId)
        .then(setPgn)
        .catch(err => {
          console.error(err);
          setError("Failed to load match history.");
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, matchId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-2xl transition-opacity animate-in fade-in duration-500" 
        onClick={onClose} 
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-5xl max-h-full bg-neutral-900/50 border border-white/10 soft-shadow flex flex-col overflow-hidden rounded-2xl animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex flex-col gap-1">
            <h2 className="technical-label text-accent">Game Replay</h2>
            <span className="text-[10px] opacity-40 technical-label">3D Analysis Engine</span>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors opacity-60 hover:opacity-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar">
          {loading ? (
             <div className="flex flex-col items-center justify-center gap-4 min-h-[400px]">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="technical-label opacity-40 animate-pulse">Initializing 3D Environment...</span>
             </div>
          ) : error ? (
            <div className="text-center p-12 technical-label text-red-400">{error}</div>
          ) : pgn ? (
            <ReplayController pgn={pgn} />
          ) : (
            <div className="text-center p-12 technical-label opacity-40">No game data available.</div>
          )}
        </div>
      </div>
    </div>
  );
};
