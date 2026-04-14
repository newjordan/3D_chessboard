import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export async function createPieces(scene, offset) {
  const piecesContainer = new THREE.Group();
  scene.add(piecesContainer);

  const pieces = [];

  const whiteMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
  const blackMaterial = new THREE.LineBasicMaterial({ color: 0x22aaff, transparent: true, opacity: 0.7 });
  const activeMaterial = new THREE.LineBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 1.0 });

  const loader = new FBXLoader();
  const loadedGeometries = {};
  
  const modelsToLoad = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
  
  // Await loading all external geometry assets provided by user
  await Promise.all(modelsToLoad.map(type => {
    return new Promise((resolve, reject) => {
      // URL references the local Vite public mappings
      loader.load(`/pieces_fbx/${type}.fbx`, (object) => {
        let geometry = null;
        object.traverse((child) => {
          if (child.isMesh && !geometry) {
             geometry = child.geometry.clone();
          }
        });
        
        if (geometry) {
          geometry.computeBoundingBox();
          let xLen = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
          let yLen = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
          let zLen = geometry.boundingBox.max.z - geometry.boundingBox.min.z;
          
          // Dynamically stand the piece upright based on its longest dimension
          if (xLen > yLen && xLen > zLen) {
             // Laying along X axis: was upside down, so spin opposite direction
             geometry.rotateZ(Math.PI / 2);
          } else if (zLen > yLen && zLen > xLen) {
             // Laying along Z axis: was upside down, so spin opposite direction
             geometry.rotateX(Math.PI / 2);
          }
          // Now compute the bounds again after rotation
          geometry.computeBoundingBox();
          
          // NEVER translate X and Z using bounding box center, because asymmetrical pieces (Knights) will have offset bases!
          // Only shift Y so it sits on the board perfectly.
          geometry.translate(0, -geometry.boundingBox.min.y, 0);
          
          const ySize = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
          // Calculate max X/Z width to ensure it fits in the 1x1 square
          const xSize = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
          const zSize = geometry.boundingBox.max.z - geometry.boundingBox.min.z;
          const largestDim = Math.max(xSize, zSize);

          let desiredHeight = 1.0;
          switch(type) {
              case 'pawn': desiredHeight = 0.8; break;
              case 'rook': desiredHeight = 1.0; break;
              case 'knight': desiredHeight = 1.25; break;
              case 'bishop': desiredHeight = 1.4; break;
              case 'queen': desiredHeight = 1.6; break;
              case 'king': desiredHeight = 1.8; break;
          }
          
          // If the model is enormously wide, we must cap its height scaling so it doesn't spill over a 1x1 square
          let scaleFac = desiredHeight / ySize;
          if (largestDim * scaleFac > 0.8) {
              scaleFac = 0.8 / largestDim; // lock width to 0.8 maximum
          }

          geometry.scale(scaleFac, scaleFac, scaleFac);
          
          loadedGeometries[type] = geometry;
        }
        resolve();
      }, undefined, (err) => {
          console.error("Failed loading model:", type, err);
          resolve(); // Resolve anyway so it doesn't break everything
      });
    });
  }));

  function createTopologicalPiece(code, isWhite) {
    const group = new THREE.Group();
    
    let typeMap = { 'P':'pawn', 'R':'rook', 'N':'knight', 'B':'bishop', 'Q':'queen', 'K':'king' };
    const typeName = typeMap[code];
    let geo = loadedGeometries[typeName];

    const material = isWhite ? whiteMaterial : blackMaterial;
    
    if (geo) {
      // Use WireframeGeometry to map the lowpoly GLB into our neon lattice style
      const wireframe = new THREE.LineSegments(new THREE.WireframeGeometry(geo), material);
      group.add(wireframe);
    } else {
      // Fallback cylinder if model fails
      const fallbackGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.0);
      fallbackGeo.translate(0, 0.5, 0);
      group.add(new THREE.LineSegments(new THREE.WireframeGeometry(fallbackGeo), material));
    }

    // Double Ring Halo under the piece
    const haloGroup = new THREE.Group();
    haloGroup.visible = false; // strictly invisible by default until simulation activates it
    const haloMat = activeMaterial.clone();
    haloMat.opacity = 0; // invisible by default
    haloMat.transparent = true;
    
    const rGeo1 = new THREE.EdgesGeometry(new THREE.CircleGeometry(0.4, 32));
    const rGeo2 = new THREE.EdgesGeometry(new THREE.CircleGeometry(0.32, 32));
    
    const ring1 = new THREE.LineLoop(rGeo1, haloMat);
    const ring2 = new THREE.LineLoop(rGeo2, haloMat);
    ring1.rotation.x = -Math.PI / 2;
    ring2.rotation.x = -Math.PI / 2;
    
    // Position slightly BELOW the grid plane so they lurk under the lattice
    ring1.position.y = -0.05;
    ring2.position.y = -0.05;
    
    haloGroup.add(ring1);
    haloGroup.add(ring2);
    
    // Add to container independently so it doesn't fly into the air when the piece jumps!
    piecesContainer.add(haloGroup);

    // Make knight face correct direction
    if (typeName === 'knight') {
      group.rotation.y = (isWhite ? Math.PI : 0) - Math.PI / 2; 
    }

    group.userData = { material, haloMat, haloGroup };

    return group;
  }

  const setup = [
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
  ];

  for(let rank = 0; rank < 8; rank++) {
    for(let file = 0; file < 8; file++) {
      const type = setup[rank][file];
      if (type) {
        // Standard mapping: Ranks 0-1 Black, Ranks 6-7 White? 
        // In our setup z is array index, let's say rank 0 is black (far) and rank 7 is white (near).
        // The array has rank 0 starting at index 0. Let's make rank > 4 white.
        const isWhite = rank > 4;
        const piece = createTopologicalPiece(type, isWhite);
        
        const x = file * 1 - (offset - 0.5);
        const z = (offset - 0.5) - (rank * 1);
        
        piece.position.set(x, 0, z);
        piece.userData.haloGroup.position.set(x, 0, z);
        
        piece.userData.type = type;
        piece.userData.isWhite = isWhite;
        piece.userData.rank = rank;
        piece.userData.file = file;
        
        piecesContainer.add(piece);
        pieces.push(piece);
      }
    }
  }

  return { 
    piecesContainer, 
    pieces,
    highlightPiece: (pieceGroup) => {
      pieceGroup.userData.haloMat.opacity = 1;
      pieceGroup.children.forEach(c => {
         if (c.type === 'LineSegments') c.material = activeMaterial;
      });
    },
    unhighlightPiece: (pieceGroup) => {
      pieceGroup.userData.haloMat.opacity = 0;
      pieceGroup.children.forEach(c => {
         if (c.type === 'LineSegments') c.material = pieceGroup.userData.material;
      });
    }
  };
}
