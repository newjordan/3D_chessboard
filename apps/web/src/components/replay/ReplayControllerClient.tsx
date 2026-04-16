"use client";

import dynamic from "next/dynamic";

const ReplayController = dynamic(
  () => import("./ReplayController").then((m) => ({ default: m.ReplayController })),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <div className="technical-label opacity-20 animate-pulse">Loading 3D Engine...</div>
      </div>
    ),
  }
);

interface ReplayControllerClientProps {
  pgn: string;
  whiteName?: string;
  blackName?: string;
  whitePieceUrl?: string;
  blackPieceUrl?: string;
  initialViewMode?: '2D' | '3D';
}

export function ReplayControllerClient(props: ReplayControllerClientProps) {
  return <ReplayController {...props} />;
}
