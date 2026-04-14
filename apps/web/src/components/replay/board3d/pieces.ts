import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Chess } from 'chess.js';
import type { PieceInstance } from './types';
import { squareToXZ } from './squareUtils';

const PIECE_HEIGHTS: Record<string, number> = {
  p: 0.8, r: 1.0, n: 1.25, b: 1.4, q: 1.6, k: 1.8,
};

const GEO_KEY: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

export type Geometries = Record<string, THREE.BufferGeometry>;

function normalizeGeometry(geo: THREE.BufferGeometry, typeName: string): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const xl = bb.max.x - bb.min.x;
  const yl = bb.max.y - bb.min.y;
  const zl = bb.max.z - bb.min.z;

  if (xl > yl && xl > zl) geo.rotateZ(Math.PI / 2);
  else if (zl > yl && zl > xl) geo.rotateX(Math.PI / 2);

  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);
  geo.computeBoundingBox();

  const bb2 = geo.boundingBox!;
  const ySize = bb2.max.y - bb2.min.y;
  const maxXZ = Math.max(bb2.max.x - bb2.min.x, bb2.max.z - bb2.min.z);
  const typeChar = Object.entries(GEO_KEY).find(([, v]) => v === typeName)?.[0] ?? 'p';
  const desiredH = PIECE_HEIGHTS[typeChar];
  let scale = desiredH / ySize;
  if (maxXZ * scale > 0.8) scale = 0.8 / maxXZ;
  geo.scale(scale, scale, scale);
}

export async function loadPieceGeometries(): Promise<Geometries> {
  const loader = new FBXLoader();
  const types = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
  const geometries: Geometries = {};

  await Promise.all(types.map(typeName =>
    new Promise<void>(resolve => {
      loader.load(`/pieces_fbx/${typeName}.fbx`, object => {
        let geo: THREE.BufferGeometry | null = null;
        object.traverse(child => {
          if ((child as THREE.Mesh).isMesh && !geo) {
            geo = (child as THREE.Mesh).geometry.clone();
          }
        });
        if (geo) {
          normalizeGeometry(geo, typeName);
          geometries[typeName] = geo;
        }
        resolve();
      }, undefined, (err) => { console.warn(`[Board3D] Failed to load FBX for ${typeName}:`, err); resolve(); });
    })
  ));

  return geometries;
}

function makeMaterial(color: 'w' | 'b'): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: color === 'w' ? 0x00ffff : 0x22aaff,
    transparent: true,
    opacity: color === 'w' ? 0.8 : 0.7,
  });
}

function buildPieceMesh(typeName: string, color: 'w' | 'b', geos: Geometries): THREE.Group {
  const group = new THREE.Group();
  const mat = makeMaterial(color);
  const geo = geos[typeName];

  if (geo) {
    group.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), mat));
  } else {
    const fallback = new THREE.CylinderGeometry(0.3, 0.4, 1.0);
    fallback.translate(0, 0.5, 0);
    group.add(new THREE.LineSegments(new THREE.WireframeGeometry(fallback), mat));
  }

  if (typeName === 'knight') {
    group.rotation.y = (color === 'w' ? Math.PI : 0) - Math.PI / 2;
  }

  group.userData.baseMaterial = mat;
  return group;
}

function buildHalo(piecesContainer: THREE.Group, x: number, z: number): { haloGroup: THREE.Group; haloMat: THREE.LineBasicMaterial } {
  const haloMat = new THREE.LineBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0 });
  const haloGroup = new THREE.Group();
  haloGroup.visible = false;

  const r1 = new THREE.LineLoop(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.4, 32)), haloMat);
  const r2 = new THREE.LineLoop(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.32, 32)), haloMat);
  r1.rotation.x = r2.rotation.x = -Math.PI / 2;
  r1.position.y = r2.position.y = -0.05;
  haloGroup.add(r1, r2);
  haloGroup.position.set(x, 0, z);
  piecesContainer.add(haloGroup);
  return { haloGroup, haloMat };
}

export function initPiecesFromFen(
  fen: string,
  geos: Geometries,
  piecesContainer: THREE.Group
): Map<string, PieceInstance> {
  const pieceMap = new Map<string, PieceInstance>();
  const chess = new Chess(fen);
  const board = chess.board();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      const rank = 8 - r;
      const square = String.fromCharCode(97 + c) + rank;
      const { x, z } = squareToXZ(square);
      const typeName = GEO_KEY[sq.type];
      const group = buildPieceMesh(typeName, sq.color as 'w' | 'b', geos);
      group.position.set(x, 0, z);
      piecesContainer.add(group);
      const { haloGroup, haloMat } = buildHalo(piecesContainer, x, z);
      pieceMap.set(square, { group, haloGroup, haloMat, square, type: sq.type, color: sq.color as 'w' | 'b' });
    }
  }

  return pieceMap;
}

export function clearPieces(pieceMap: Map<string, PieceInstance>, piecesContainer: THREE.Group): void {
  pieceMap.forEach(({ group, haloGroup }) => {
    const disposeObject = (obj: THREE.Object3D) => {
      obj.traverse(child => {
        const c = child as THREE.Mesh | THREE.LineSegments;
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(m => m.dispose());
        }
      });
    };
    disposeObject(group);
    disposeObject(haloGroup);
    piecesContainer.remove(group);
    piecesContainer.remove(haloGroup);
  });
  pieceMap.clear();
}
