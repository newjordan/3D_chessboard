"use client";

import React, { useState, useRef } from 'react';
import { Camera, Gamepad2, Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ApiClient } from '@/lib/apiClient';
import { useRouter } from 'next/navigation';

interface AssetUploadProps {
  engineId: string;
  userId: string;
  currentAvatar?: string;
  currentPiece?: string;
}

export function AssetUpload({ engineId, userId, currentAvatar, currentPiece }: AssetUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const pieceInputRef = useRef<HTMLInputElement>(null);
  
  const [avatarPreview, setAvatarPreview] = useState<string | null>(currentAvatar || null);
  const [piecePreview, setPiecePreview] = useState<string | null>(currentPiece || null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'piece') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'avatar') setAvatarPreview(reader.result as string);
      else setPiecePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    // Auto upload on change for ease of use, or we can add a button.
    // Let's add a "Save Changes" button to avoid accidental uploads and combine them.
    setStatus('idle');
  };

  const handleSave = async () => {
    setIsUploading(true);
    setStatus('idle');
    setError(null);

    const formData = new FormData();
    if (avatarInputRef.current?.files?.[0]) {
      formData.append('avatar', avatarInputRef.current.files[0]);
    }
    if (pieceInputRef.current?.files?.[0]) {
      formData.append('piece', pieceInputRef.current.files[0]);
    }

    if (formData.getAll('avatar').length === 0 && formData.getAll('piece').length === 0) {
      setIsUploading(false);
      return;
    }

    try {
      await ApiClient.uploadEngineAssets(engineId, userId, formData);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
      // Optional: Refresh page to see changes across all components
      // window.location.reload(); 
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setError(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-6">
        {/* Avatar Upload */}
        <div className="flex flex-col gap-3">
          <span className="technical-label text-[10px]">Agent Identity (Avatar)</span>
          <div 
            onClick={() => avatarInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-accent/40 transition-all cursor-pointer flex items-center justify-center overflow-hidden group relative"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
            ) : (
              <Camera size={24} className="opacity-20 group-hover:text-accent group-hover:opacity-100 transition-all" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] technical-label uppercase font-bold text-white">
              Change
            </div>
          </div>
          <input 
            type="file" 
            ref={avatarInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={(e) => handleFileChange(e, 'avatar')} 
          />
        </div>

        {/* Piece Upload */}
        <div className="flex flex-col gap-3">
          <span className="technical-label text-[10px]">Custom Piece (2D Only)</span>
          <div 
            onClick={() => pieceInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-accent/40 transition-all cursor-pointer flex items-center justify-center overflow-hidden group relative"
          >
            {piecePreview ? (
              <img src={piecePreview} alt="Piece Preview" className="w-full h-full object-contain p-2" />
            ) : (
              <Gamepad2 size={24} className="opacity-20 group-hover:text-accent group-hover:opacity-100 transition-all" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] technical-label uppercase font-bold text-white">
              Change
            </div>
          </div>
          <input 
            type="file" 
            ref={pieceInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={(e) => handleFileChange(e, 'piece')} 
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isUploading}
        className={`flex items-center justify-center gap-2 py-3 rounded font-bold text-[11px] technical-label uppercase tracking-widest transition-all ${
          status === 'success' ? 'bg-green-600 text-white' : 'bg-accent text-black hover:scale-[1.02] active:scale-95'
        } disabled:opacity-50`}
      >
        {isUploading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : status === 'success' ? (
          <>
            <CheckCircle2 size={14} /> Assets Updated
          </>
        ) : (
          <>
            <Upload size={14} /> Save Visual Changes
          </>
        )}
      </button>

      {error && (
        <div className="flex items-center gap-2 text-red-500 text-[10px] technical-label animate-in fade-in slide-in-from-top-1">
          <AlertCircle size={12} /> {error}
        </div>
      )}
    </div>
  );
}
