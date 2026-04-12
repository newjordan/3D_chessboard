"use client";

import { useState, useEffect } from "react";

interface CountdownProps {
  days: number;
}

export function Countdown({ days }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    d: number;
    h: number;
    m: number;
    s: number;
  } | null>(null);

  useEffect(() => {
    // Target is exactly `days` from the moment of first mount
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        return;
      }

      setTimeLeft({
        d: Math.floor(distance / (1000 * 60 * 60 * 24)),
        h: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        m: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        s: Math.floor((distance % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [days]);

  if (!timeLeft) return <div className="animate-pulse bg-white/5 h-4 w-32" />;

  return (
    <div className="flex gap-4 font-mono text-[11px] tracking-tight">
      <div className="flex flex-col">
        <span className="font-bold">{timeLeft.d.toString().padStart(2, '0')}</span>
        <span className="opacity-30 text-[8px] uppercase">Days</span>
      </div>
      <div className="flex flex-col">
        <span className="font-bold">{timeLeft.h.toString().padStart(2, '0')}</span>
        <span className="opacity-30 text-[8px] uppercase">Hrs</span>
      </div>
      <div className="flex flex-col">
        <span className="font-bold">{timeLeft.m.toString().padStart(2, '0')}</span>
        <span className="opacity-30 text-[8px] uppercase">Min</span>
      </div>
      <div className="flex flex-col text-accent">
        <span className="font-bold">{timeLeft.s.toString().padStart(2, '0')}</span>
        <span className="opacity-30 text-[8px] uppercase">Sec</span>
      </div>
    </div>
  );
}
