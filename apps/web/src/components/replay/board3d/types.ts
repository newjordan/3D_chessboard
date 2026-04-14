import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Board3DHandle {
  applyMove(from: string, to: string, isCapture: boolean, promotion?: string): void;
  resetToPosition(fen: string): void;
  highlightSquare(square: string | null): void;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  controls: OrbitControls;
  dispose(): void;
}

export interface PieceInstance {
  group: THREE.Group;
  haloGroup: THREE.Group;
  haloMat: THREE.LineBasicMaterial;
  square: string;
  type: string; // 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
  color: 'w' | 'b';
}
