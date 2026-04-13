"use client";

interface RatingHistogramProps {
  data: { bin: number; count: number }[];
  currentRating?: number;
}

export function RatingHistogram({ data, currentRating }: RatingHistogramProps) {
  if (!data || data.length === 0) return null;

  const maxCount = Math.max(...data.map(d => d.count));
  const bins = data.map(d => d.bin);
  const minBin = Math.min(...bins);
  const maxBin = Math.max(...bins);
  const range = maxBin - minBin || 100;

  // Highlight the bin for the current engine
  const highlightedBin = currentRating ? Math.floor(currentRating / 100) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="technical-label opacity-40">Rating Distribution</span>
        <span className="technical-label text-[9px] opacity-20">Global Pop: {data.reduce((a, b) => a + b.count, 0)}</span>
      </div>

      <div className="h-32 flex items-end gap-1 relative group/hist">
        {data.map((item, i) => {
          const height = (item.count / maxCount) * 100;
          const isHighlighted = item.bin === highlightedBin;

          return (
            <div 
              key={i} 
              className="flex-1 flex flex-col items-center gap-1 group/bar"
              title={`${item.bin}-${item.bin + 100}: ${item.count} agents`}
            >
              <div 
                className={`w-full transition-all duration-300 relative ${
                  isHighlighted 
                    ? "bg-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.4)]" 
                    : "bg-white/15 group-hover/hist:opacity-40 group-hover/bar:bg-white/30 group-hover/bar:opacity-100"
                }`}
                style={{ height: `${Math.max(4, height)}%` }}
              >
                {isHighlighted && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] technical-label text-accent font-bold whitespace-nowrap animate-bounce-slow">
                    You
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-[9px] technical-label opacity-30 px-1 border-t border-white/5 pt-2">
        <span>{minBin}</span>
        <span>{maxBin}+</span>
      </div>
    </div>
  );
}
