import * as THREE from 'three';

export function createPieces(scene, offset) {
  const piecesContainer = new THREE.Group();
  scene.add(piecesContainer);

  const pieces = [];

  const whiteMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
  const blackMaterial = new THREE.LineBasicMaterial({ color: 0x22aaff, transparent: true, opacity: 0.7 });
  const activeMaterial = new THREE.LineBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 1.0 });

  function createTopologicalPiece(type, isWhite) {
    const group = new THREE.Group();
    let geometries = [];
    let height = 0.8;

    // Use combinations of Lathe, Sphere, and Cylinder for topological complex nets
    const addMesh = (geom, yPos) => {
      geom.translate(0, yPos, 0);
      geometries.push(geom);
    };

    const r1 = 0.35, r2 = 0.15;
    
    // Base is always a ring stack
    addMesh(new THREE.CylinderGeometry(0.3, r1, 0.2, 16, 2), 0.1);

    switch (type) {
      case 'P':
        height = 0.8;
        addMesh(new THREE.CylinderGeometry(r2, 0.25, 0.4, 12, 4), 0.4);
        addMesh(new THREE.SphereGeometry(r2 + 0.05, 12, 8), 0.7);
        break;
      case 'R':
        height = 1.0;
        addMesh(new THREE.CylinderGeometry(0.25, 0.28, 0.6, 16, 6), 0.5);
        addMesh(new THREE.CylinderGeometry(0.3, 0.25, 0.2, 16, 2), 0.9);
        break;
      case 'N':
        height = 1.2;
        addMesh(new THREE.CylinderGeometry(0.2, 0.28, 0.4, 12, 4), 0.4);
        // Horse head proxy - asymmetrical topological
        addMesh(new THREE.SphereGeometry(0.25, 12, 8), 0.8);
        addMesh(new THREE.CylinderGeometry(0.1, 0.2, 0.3, 8, 3).rotateX(Math.PI/4).translate(0, 0, 0.1), 0.9);
        break;
      case 'B':
        height = 1.3;
        addMesh(new THREE.CylinderGeometry(r2, 0.25, 0.6, 12, 5), 0.5);
        addMesh(new THREE.ConeGeometry(r2 + 0.05, 0.4, 12, 4), 0.9);
        addMesh(new THREE.SphereGeometry(0.05, 8, 8), 1.15);
        break;
      case 'Q':
        height = 1.6;
        addMesh(new THREE.CylinderGeometry(r2, 0.3, 0.8, 16, 6), 0.6);
        addMesh(new THREE.SphereGeometry(0.25, 16, 8), 1.1);
        addMesh(new THREE.CylinderGeometry(0.3, 0.1, 0.3, 12, 2), 1.35); // crown
        break;
      case 'K':
        height = 1.8;
        addMesh(new THREE.CylinderGeometry(r2, 0.3, 0.9, 16, 6), 0.65);
        addMesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 16, 4), 1.25);
        addMesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), 1.55); // cross vertical
        addMesh(new THREE.BoxGeometry(0.2, 0.1, 0.1), 1.55); // cross horizontal
        break;
    }

    const material = isWhite ? whiteMaterial : blackMaterial;
    
    // We use WireframeGeometry on each added mesh for the intricate grid look
    geometries.forEach(geo => {
      const wireframe = new THREE.LineSegments(new THREE.WireframeGeometry(geo), material);
      group.add(wireframe);
    });

    // Double Ring Halo under the piece
    const haloGroup = new THREE.Group();
    const haloMat = activeMaterial.clone();
    haloMat.opacity = 0; // invisible by default
    haloMat.transparent = true;
    
    const rGeo1 = new THREE.EdgesGeometry(new THREE.CircleGeometry(0.4, 32));
    const rGeo2 = new THREE.EdgesGeometry(new THREE.CircleGeometry(0.32, 32));
    
    const ring1 = new THREE.LineLoop(rGeo1, haloMat);
    const ring2 = new THREE.LineLoop(rGeo2, haloMat);
    ring1.rotation.x = -Math.PI / 2;
    ring2.rotation.x = -Math.PI / 2;
    ring1.position.y = 0.02;
    ring2.position.y = 0.02;
    
    haloGroup.add(ring1);
    haloGroup.add(ring2);
    group.add(haloGroup);

    group.userData = { material, haloMat };

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
        const isWhite = rank < 2;
        const piece = createTopologicalPiece(type, isWhite);
        
        const x = file * 1 - (offset - 0.5);
        const z = (offset - 0.5) - (rank * 1);
        
        piece.position.set(x, 0, z);
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
      // Color rings to active and opacity 1
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
