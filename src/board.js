import * as THREE from 'three';

export function createBoard(scene) {
  const masterGroup = new THREE.Group();
  const boardGroup = new THREE.Group();
  
  const squareSize = 1;
  const boardSize = squareSize * 8;
  const offset = boardSize / 2;
  const boardThickness = 0.5;

  // Sharp thin grid
  const gridMaterial = new THREE.LineBasicMaterial({ color: 0x2288ff, transparent: true, opacity: 0.4 });
  const points = [];
  for (let i = 0; i <= 8; i++) {
    points.push(new THREE.Vector3(-offset, 0, i * squareSize - offset), new THREE.Vector3(offset, 0, i * squareSize - offset));
    points.push(new THREE.Vector3(i * squareSize - offset, 0, -offset), new THREE.Vector3(i * squareSize - offset, 0, offset));
  }
  const gridLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), gridMaterial);
  boardGroup.add(gridLines);

  // Outer border lips (Double line)
  const borderMaterial = new THREE.LineBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.8 });
  const doubleBorderGeom = new THREE.BufferGeometry();
  const dbPoints = [];
  const b1 = offset + 0.08;
  const b2 = offset + 0.3;
  const b3 = b2 + 0.6; // Extended flat tab at the bottom

  const pushBox = (s) => [
    new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0, -s),
    new THREE.Vector3(s, 0, -s), new THREE.Vector3(s, 0, s),
    new THREE.Vector3(s, 0, s), new THREE.Vector3(-s, 0, s),
    new THREE.Vector3(-s, 0, s), new THREE.Vector3(-s, 0, -s),
  ];
  dbPoints.push(...pushBox(b1), ...pushBox(b2));
  doubleBorderGeom.setFromPoints(dbPoints);
  boardGroup.add(new THREE.LineSegments(doubleBorderGeom, borderMaterial));

  // Depth Box (Sides), Bisection, and Extended Bottom Tab
  const sidesGeom = new THREE.BufferGeometry();
  const sidePoints = [];
  
  // vertical pillars
  [[-b2, -b2], [b2, -b2], [b2, b2], [-b2, b2]].forEach(([x, z]) => {
    sidePoints.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, -boardThickness, z));
  });
  
  // bisection rim
  pushBox(b2).forEach(p => { p.y = -boardThickness / 2; sidePoints.push(p); });
  // bottom inner rim
  pushBox(b2).forEach(p => { p.y = -boardThickness; sidePoints.push(p); });
  
  // Extended bottom flat tab (Outer rim)
  pushBox(b3).forEach(p => { p.y = -boardThickness; sidePoints.push(p); });
  // Connect inner b2 to outer b3 on the corners of the flat tab
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([mx, mz]) => {
    sidePoints.push(new THREE.Vector3(mx * b2, -boardThickness, mz * b2), new THREE.Vector3(mx * b3, -boardThickness, mz * b3));
  });
  
  sidesGeom.setFromPoints(sidePoints);
  boardGroup.add(new THREE.LineSegments(sidesGeom, new THREE.LineBasicMaterial({ color: 0x2288ff, transparent: true, opacity: 0.5 })));

  // Corner 2x2 Dots - Move them out to sit ON the extended tab or rim
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
  const dotGeo = new THREE.PlaneGeometry(0.03, 0.03);
  const placeDots = (x, y, z, ry) => {
    const group = new THREE.Group();
    [-0.04, 0.04].forEach(dx => {
      [-0.04, 0.04].forEach(dy => {
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(dx, dy, 0);
        group.add(dot);
      });
    });
    group.position.set(x, y, z);
    // Since tab is flat, dots should lie flat
    group.rotation.x = -Math.PI / 2;
    group.rotation.z = ry;
    boardGroup.add(group);
  };
  
  // Place dots on the corners of the flat tab
  const cornerTabOffset = b3 - 0.15;
  placeDots(-cornerTabOffset, -boardThickness + 0.01, cornerTabOffset, 0);
  placeDots(cornerTabOffset, -boardThickness + 0.01, cornerTabOffset, 0);
  placeDots(-cornerTabOffset, -boardThickness + 0.01, -cornerTabOffset, 0);
  placeDots(cornerTabOffset, -boardThickness + 0.01, -cornerTabOffset, 0);

  // Labels and Hatches (Now placed on the tab)
  const tabCenterDist = (b2 + b3) / 2;
  createCoordinates(boardGroup, offset, boardThickness, tabCenterDist, b2, b3);
  
  // Grid highlights
  addGridDecorations(boardGroup, offset);

  masterGroup.add(boardGroup);

  // Ambient Grid Crawlers
  const updateTracers = createAmbientGridData(boardGroup, offset);

  // Fake Reflection (Upside down, faded)
  const reflection = boardGroup.clone();
  reflection.scale.y = -1;
  reflection.position.y = -boardThickness - 0.01;
  reflection.traverse((child) => {
    if (child.material) {
      child.material = child.material.clone();
      if (child.isMesh) {
        // text/dots - keep them very dim
        child.material.opacity = 0.05;
      } else {
        // lines
        child.material.opacity *= 0.15;
      }
      child.material.transparent = true;
      child.material.blending = THREE.AdditiveBlending;
    }
  });
  masterGroup.add(reflection);

  scene.add(masterGroup);
  
  return { boardGroup, squareSize, offset, update: updateTracers };
}

function createCoordinates(parent, offset, boardThickness, tabDist, b2, b3) {
  // Letters
  const lettersFront = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const lettersRight = ['1', '2', '3', '4', '5', '6', '7', '8'];

  const createTextSprite = (text) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '300 32px sans-serif';
    ctx.fillStyle = '#66ccff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 6;
    ctx.fillText(text, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  };

  const lineMat = new THREE.LineBasicMaterial({ color: 0x44aaff, transparent:true, opacity:0.5 });
  // The tab is vertically at -boardThickness. Add tiny amount to stop z-fighting.
  const yPos = -boardThickness + 0.01;

  // Front Edge
  for (let i = 0; i < 8; i++) {
    const x = i * 1 - (offset - 0.5);
    
    const tFront = createTextSprite(lettersFront[i]);
    tFront.position.set(x, yPos, tabDist);
    // Lay flat on Y axis. Bottom towards user.
    tFront.rotation.x = -Math.PI / 2;
    tFront.rotation.z = 0;
    parent.add(tFront);

    // Hatches visually separating letters flat on the tab
    const hatchPts = [];
    if (i < 7) {
      const hx = x + 0.5;
      hatchPts.push(new THREE.Vector3(hx, yPos, b2), new THREE.Vector3(hx, yPos, b3));
    }
    // Also do back edge hatches
    if (i < 7) {
      const hx = x + 0.5;
      hatchPts.push(new THREE.Vector3(hx, yPos, -b2), new THREE.Vector3(hx, yPos, -b3));
    }
    if (hatchPts.length > 0) parent.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hatchPts), lineMat));
  }

  // Right Edge
  for (let i = 0; i < 8; i++) {
    const z = (offset - 0.5) - (i * 1);
    
    const tRight = createTextSprite(lettersRight[i]);
    tRight.position.set(tabDist, yPos, z);
    // Lay flat, rotate 90 degrees so top faces left/center
    tRight.rotation.x = -Math.PI / 2;
    tRight.rotation.z = Math.PI / 2;
    parent.add(tRight);
    
    const hatchPts = [];
    if (i < 7) {
      const hz = z - 0.5;
      hatchPts.push(new THREE.Vector3(b2, yPos, hz), new THREE.Vector3(b3, yPos, hz));
    }
    if (hatchPts.length > 0) parent.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hatchPts), lineMat));
  }
}

function addGridDecorations(parent, offset) {
  const greenMat = new THREE.LineBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.6 });
  const circleGeom = new THREE.EdgesGeometry(new THREE.CircleGeometry(0.35, 32));
  
  const targets = [{x: -3.5, z: 2.5}, {x: -2.5, z: 1.5}, {x: -0.5, z: 1.5}, {x: 0.5, z: 2.5}, {x: -1.5, z: 2.5}];
  targets.forEach(t => {
    const circle = new THREE.LineLoop(circleGeom, greenMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(t.x, 0.01, t.z);
    parent.add(circle);
  });

  const bracketMat = new THREE.LineDashedMaterial({ color: 0x00ff66, dashSize: 0.04, gapSize: 0.04, transparent: true, opacity: 0.6 });
  const bSize = 0.45;
  const bPts = [];
  const addCornerLines = (x, z) => {
    bPts.push(new THREE.Vector3(x-bSize, 0, z-bSize+0.1), new THREE.Vector3(x-bSize, 0, z-bSize), new THREE.Vector3(x-bSize, 0, z-bSize), new THREE.Vector3(x-bSize+0.1, 0, z-bSize));
    bPts.push(new THREE.Vector3(x+bSize, 0, z-bSize+0.1), new THREE.Vector3(x+bSize, 0, z-bSize), new THREE.Vector3(x+bSize, 0, z-bSize), new THREE.Vector3(x+bSize-0.1, 0, z-bSize));
    bPts.push(new THREE.Vector3(x-bSize, 0, z+bSize-0.1), new THREE.Vector3(x-bSize, 0, z+bSize), new THREE.Vector3(x-bSize, 0, z+bSize), new THREE.Vector3(x-bSize+0.1, 0, z+bSize));
    bPts.push(new THREE.Vector3(x+bSize, 0, z+bSize-0.1), new THREE.Vector3(x+bSize, 0, z+bSize), new THREE.Vector3(x+bSize, 0, z+bSize), new THREE.Vector3(x+bSize-0.1, 0, z+bSize));
  };
  addCornerLines(-1.5, -2.5);
  addCornerLines(2.5, 0.5);

  const bracketGeo = new THREE.BufferGeometry().setFromPoints(bPts);
  const brackets = new THREE.LineSegments(bracketGeo, bracketMat);
  brackets.computeLineDistances(); 
  brackets.position.y = 0.02;
  parent.add(brackets);
}

function createAmbientGridData(parent, offset) {
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 });
  const dotGeo = new THREE.PlaneGeometry(0.02, 0.02);
  const dots = [];
  
  // Create tiny dotmatrix bots
  for (let i = 0; i < 80; i++) {
     const dot = new THREE.Mesh(dotGeo, dotMat);
     dot.rotation.x = -Math.PI / 2;
     
     // Randomize their starting setup
     const isHorizontal = Math.random() > 0.5;
     const lineIdx = Math.floor(Math.random() * 9) - 4; // -4 to +4
     const posOnLine = (Math.random() - 0.5) * 8; // -4 to +4
     
     const speed = (Math.random() * 0.4 + 0.1) * (Math.random() > 0.5 ? 1 : -1);
     
     dot.userData = { isHorizontal, lineIdx, posOnLine, speed };
     parent.add(dot);
     dots.push(dot);
  }
  
  return (delta) => {
    dots.forEach(dot => {
       dot.userData.posOnLine += dot.userData.speed * delta;
       if (dot.userData.posOnLine > 4) dot.userData.posOnLine = -4;
       if (dot.userData.posOnLine < -4) dot.userData.posOnLine = 4;
       
       if (dot.userData.isHorizontal) {
         dot.position.set(dot.userData.posOnLine, 0.005, dot.userData.lineIdx);
       } else {
         dot.position.set(dot.userData.lineIdx, 0.005, dot.userData.posOnLine);
       }
       // Random flickering to simulate matrix data transfer
       dot.material.opacity = Math.random() > 0.85 ? 1 : 0.1;
    });
  };
}
