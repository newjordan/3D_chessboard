"use client";

import React, { useMemo } from 'react';
import * as THREE from 'three';

interface PieceProps {
  type: string;
  color: 'w' | 'b';
  position: [number, number, number];
}

// Helper to create a smooth Staunton-style profile for LatheGeometry
const createProfile = (type: string) => {
  const points: THREE.Vector2[] = [];
  switch (type.toLowerCase()) {
    case 'p': // Pawn
      points.push(new THREE.Vector2(0, 0));
      points.push(new THREE.Vector2(0.35, 0));
      points.push(new THREE.Vector2(0.3, 0.1));
      points.push(new THREE.Vector2(0.15, 0.4));
      points.push(new THREE.Vector2(0.2, 0.6));
      points.push(new THREE.Vector2(0.25, 0.7));
      points.push(new THREE.Vector2(0, 0.8));
      break;
    case 'r': // Rook
      points.push(new THREE.Vector2(0, 0));
      points.push(new THREE.Vector2(0.4, 0));
      points.push(new THREE.Vector2(0.35, 0.8));
      points.push(new THREE.Vector2(0.4, 0.9));
      points.push(new THREE.Vector2(0, 0.9));
      break;
    case 'n': // Knight Base (Lathe doesn't work for the head, we'll stack)
      points.push(new THREE.Vector2(0, 0));
      points.push(new THREE.Vector2(0.4, 0));
      points.push(new THREE.Vector2(0.3, 0.2));
      points.push(new THREE.Vector2(0.2, 0.5));
      points.push(new THREE.Vector2(0, 0.5));
      break;
    case 'b': // Bishop
      points.push(new THREE.Vector2(0, 0));
      points.push(new THREE.Vector2(0.4, 0));
      points.push(new THREE.Vector2(0.25, 0.3));
      points.push(new THREE.Vector2(0.2, 0.7));
      points.push(new THREE.Vector2(0.25, 0.9));
      points.push(new THREE.Vector2(0.1, 1.0));
      points.push(new THREE.Vector2(0, 1.1));
      break;
    case 'q': // Queen
      points.push(new THREE.Vector2(0, 0));
      points.push(new THREE.Vector2(0.45, 0));
      points.push(new THREE.Vector2(0.25, 0.5));
      points.push(new THREE.Vector2(0.35, 1.1));
      points.push(new THREE.Vector2(0.2, 1.2));
      points.push(new THREE.Vector2(0, 1.25));
      break;
    case 'k': // King
      points.push(new THREE.Vector2(0, 0));
      points.push(new THREE.Vector2(0.45, 0));
      points.push(new THREE.Vector2(0.3, 0.5));
      points.push(new THREE.Vector2(0.35, 1.2));
      points.push(new THREE.Vector2(0.4, 1.3));
      points.push(new THREE.Vector2(0, 1.4));
      break;
  }
  return points;
};

export const Piece3D: React.FC<PieceProps> = ({ type, color, position }) => {
  const isWhite = color === 'w';
  const t = type.toLowerCase();
  
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: isWhite ? '#ffffff' : '#0a0a0a',
    metalness: isWhite ? 0.3 : 0.8,
    roughness: isWhite ? 0.4 : 0.2,
    emissive: !isWhite ? '#111111' : '#000000',
    emissiveIntensity: !isWhite ? 0.6 : 0,
  }), [isWhite]);

  const geometry = useMemo(() => {
    const profile = createProfile(type);
    const lathe = new THREE.LatheGeometry(profile, 32);
    
    // For Knights and Rooks, we need more than just a lathe
    if (type.toLowerCase() === 'n') {
       // Merge a tilted box for the head
       const head = new THREE.BoxGeometry(0.35, 0.5, 0.6);
       head.translate(0, 0.7, 0.1);
       head.rotateX(Math.PI / 6);
       // Lathe is the base
       return lathe; // Keep it simple for knight base for now, we'll stack in JSX
    }
    
    return lathe;
  }, [type]);

  // Specific piece rendering for complexity
  const renderPiece = () => {
    const t = type.toLowerCase();
    
    if (t === 'n') {
      return (
        <group>
          <mesh geometry={geometry} material={material} castShadow receiveShadow />
          <mesh position={[0, 0.6, 0.1]} rotation={[Math.PI / 4, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.3, 0.5, 0.5]} />
            <primitive object={material} attach="material" />
          </mesh>
        </group>
      );
    }

    if (t === 'r') {
      return (
        <group>
          <mesh geometry={geometry} material={material} castShadow receiveShadow />
          {/* Battlements */}
          <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.4, 0.4, 0.2, 32]} />
            <primitive object={material} attach="material" />
          </mesh>
        </group>
      );
    }

    if (t === 'k') {
      return (
        <group>
          <mesh geometry={geometry} material={material} castShadow receiveShadow />
          {/* Cross on top */}
          <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.1, 0.3, 0.1]} />
            <primitive object={material} attach="material" />
          </mesh>
          <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.3, 0.1, 0.1]} />
            <primitive object={material} attach="material" />
          </mesh>
        </group>
      );
    }

    return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
  };

  return (
    <group position={position} rotation={[0, t === 'n' && !isWhite ? Math.PI : 0, 0]}>
      {renderPiece()}
    </group>
  );
};
