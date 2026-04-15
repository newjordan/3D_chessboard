"use client";

import { useEffect, useRef } from "react";
import { setupScene } from "@/components/replay/board3d/scene";
import { createBoard } from "@/components/replay/board3d/board";

export default function Board3DCapturePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = setupScene(canvas);
    createBoard(ctx.scene, "WHITE", "BLACK");

    // Remove the starfield for a clean board base texture.
    ctx.scene.children
      .filter((child) => child.type === "Points")
      .forEach((child) => ctx.scene.remove(child));

    ctx.scene.fog = null;
    ctx.camera.position.set(0, 42, 0.001);
    ctx.camera.lookAt(0, 0, 0);
    ctx.controls.target.set(0, 0, 0);
    ctx.controls.enableRotate = false;
    ctx.controls.enablePan = false;
    ctx.controls.enableZoom = false;
    ctx.controls.update();

    let frameId = 0;
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      ctx.composer.render();
    };
    tick();

    return () => {
      cancelAnimationFrame(frameId);
      ctx.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center p-6">
      <div className="w-[min(90vw,1100px)] aspect-square border border-white/10 rounded-lg overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
}

