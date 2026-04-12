"use client";

import React from 'react';
import { Box } from '@react-three/drei';

export const Board3D: React.FC = () => {
  const squares = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const isBlack = (r + c) % 2 === 1;
      squares.push(
        <Box 
          key={`${r}-${c}`} 
          args={[1, 0.1, 1]} 
          position={[c - 3.5, -0.05, r - 3.5]}
          receiveShadow
        >
          <meshStandardMaterial 
            color={isBlack ? "#111111" : "#d0d0d0"}
            roughness={0.1}
            metalness={0.2}
            // Add a very subtle emissive glow to the board cells to help depth perception
            emissive={isBlack ? "#1a1a1a" : "#444444"}
            emissiveIntensity={0.2}
          />
        </Box>
      );
    }
  }

  return (
    <group>
      {/* Outer Frame / Base */}
      <Box args={[8.6, 0.25, 8.6]} position={[0, -0.15, 0]} receiveShadow>
        <meshStandardMaterial 
          color="#050505"
          roughness={0.05}
          metalness={0.8}
        />
      </Box>
      {squares}
    </group>
  );
};
