"use client";

import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area, 
  AreaChart,
  ReferenceDot,
  Label
} from 'recharts';

interface EloHistoryChartProps {
  ratings: { ratingAfter: number; createdAt: string }[];
}

export function EloHistoryChart({ ratings }: EloHistoryChartProps) {
  if (!ratings || ratings.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center border border-dashed border-white/5 rounded-xl bg-white/[0.01]">
        <span className="technical-label opacity-20 italic">No ratings history yet</span>
      </div>
    );
  }

  // Format data for Recharts
  const data = ratings.map(r => ({
    rating: r.ratingAfter,
    name: new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    timestamp: new Date(r.createdAt).getTime(),
  }));

  const minRating = Math.min(...data.map(d => d.rating)) - 50;
  const maxRating = Math.max(...data.map(d => d.rating)) + 50;
  const lastPoint = data[data.length - 1];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/80 border border-white/10 backdrop-blur-md p-3 rounded shadow-2xl">
          <p className="text-[10px] technical-label opacity-40 uppercase mb-1">{payload[0].payload.name}</p>
          <p className="text-sm font-bold font-mono">
            Rating: <span className="text-accent">{payload[0].value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-48 sm:h-64 relative pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorRating" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#var(--accent-rgb)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#var(--accent-rgb)" stopOpacity={0}/>
            </linearGradient>
            {/* Fallback for accent color if css variable fails in SVG */}
            <linearGradient id="premiumGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(var(--accent-rgb), 0.4)" />
              <stop offset="100%" stopColor="rgba(var(--accent-rgb), 0)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
          <XAxis 
            dataKey="name" 
            hide={true} 
          />
          <YAxis 
            domain={[Math.max(0, minRating), maxRating]} 
            hide={true}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            type="monotone" 
            dataKey="rating" 
            stroke="var(--accent)" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#premiumGradient)"
            animationDuration={1500}
          />
          <ReferenceDot
            x={lastPoint.name}
            y={lastPoint.rating}
            r={5}
            fill="var(--accent)"
            stroke="white"
            strokeWidth={2}
            className="animate-pulse"
          >
            <Label 
               value="YOU" 
               position="top" 
               offset={10} 
               fill="var(--accent)" 
               fontSize={10} 
               fontWeight="bold"
               className="technical-label"
            />
          </ReferenceDot>
        </AreaChart>
      </ResponsiveContainer>
      
      {/* Visual Axis Helper */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[9px] technical-label opacity-20 border-t border-white/5 pt-2">
        <span>{data[0].name}</span>
        <span>{lastPoint.name} (Current)</span>
      </div>
    </div>
  );
}
