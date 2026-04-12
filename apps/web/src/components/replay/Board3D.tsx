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
        >
          <meshPhysicalMaterial 
            color={isBlack ? "#111111" : "#ffffff"}
            transmission={0.8}
            thickness={0.2}
            roughness={0.1}
            ior={1.45}
            opacity={0.6}
            transparent
          />
        </Box>
      );
    }
  }

  return (
    <group>
      {/* Base thickness for the whole board */}
      <Box args={[8.5, 0.2, 8.5]} position={[0, -0.2, 0]}>
        <meshPhysicalMaterial 
          color="#333333"
          transmission={1}
          thickness={1}
          roughness={0.01}
          opacity={0.3}
          transparent
        />
      </Box>
      {squares}
      
      {/* Move Highlighters or Coordinates could be added here */}
    </group>
  );
};
