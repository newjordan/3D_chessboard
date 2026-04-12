"use client";

import React, { useMemo } from 'react';
import { Box, Cylinder, Sphere, Torus } from '@react-three/drei';

interface PieceProps {
  type: string;
  color: 'w' | 'b';
  position: [number, number, number];
}

const RobustMaterial = ({ color }: { color: 'w' | 'b' }) => (
  <meshStandardMaterial
    color={color === 'w' ? '#f0f0f0' : '#1a1a1a'}
    roughness={0.1}
    metalness={color === 'w' ? 0.3 : 0.6}
  />
);

export const Piece3D: React.FC<PieceProps> = ({ type, color, position }) => {
  const mesh = useMemo(() => {
    switch (type.toLowerCase()) {
      case 'p': // Pawn
        return (
          <group position={[0, 0.4, 0]}>
            <Cylinder args={[0.2, 0.3, 0.6, 32]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Cylinder>
            <Sphere args={[0.25, 32]} position={[0, 0.4, 0]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Sphere>
          </group>
        );
      case 'r': // Rook
        return (
          <Box args={[0.5, 0.8, 0.5]} position={[0, 0.4, 0]} castShadow receiveShadow>
            <RobustMaterial color={color} />
          </Box>
        );
      case 'n': // Knight
        return (
          <group position={[0, 0.5, 0]} rotation={[0, color === 'w' ? 0 : Math.PI, 0]}>
            <Cylinder args={[0.25, 0.3, 0.7, 32]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Cylinder>
            <Box args={[0.3, 0.4, 0.5]} position={[0, 0.3, 0.1]} rotation={[Math.PI / 4, 0, 0]} castShadow receiveShadow>
               <RobustMaterial color={color} />
            </Box>
          </group>
        );
      case 'b': // Bishop
        return (
          <group position={[0, 0.5, 0]}>
            <Cylinder args={[0.15, 0.3, 0.8, 32]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Cylinder>
            <Sphere args={[0.2, 32]} position={[0, 0.5, 0]} scale={[1, 1.5, 1]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Sphere>
          </group>
        );
      case 'q': // Queen
        return (
          <group position={[0, 0.6, 0]}>
            <Cylinder args={[0.2, 0.3, 1, 32]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Cylinder>
            <Torus args={[0.25, 0.05, 16, 32]} position={[0, 0.5, 0]} rotation={[Math.PI/2, 0, 0]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Torus>
          </group>
        );
      case 'k': // King
        return (
          <group position={[0, 0.6, 0]}>
            <Cylinder args={[0.25, 0.3, 1.1, 32]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Cylinder>
            <Box args={[0.1, 0.4, 0.1]} position={[0, 0.7, 0]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Box>
            <Box args={[0.4, 0.1, 0.1]} position={[0, 0.7, 0]} castShadow receiveShadow>
              <RobustMaterial color={color} />
            </Box>
          </group>
        );
      default:
        return null;
    }
  }, [type, color]);

  return <group position={position}>{mesh}</group>;
};
