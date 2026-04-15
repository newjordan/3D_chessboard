import * as THREE from 'three';

const OFFSET = 4; // half of 8 squares
const BOARD_THICKNESS = 0.5;
const B1 = OFFSET + 0.08;
const B2 = OFFSET + 0.3;
const B3 = B2 + 0.6;

function createCellDepthStack(): THREE.Group {
  const group = new THREE.Group();
  const squareGeo = new THREE.PlaneGeometry(0.9, 0.9);
  const layers = [
    { y: -0.018, opacity: 0.09, scale: 1.0 },
    { y: -0.068, opacity: 0.055, scale: 0.96 },
    { y: -0.122, opacity: 0.03, scale: 0.92 },
  ] as const;
  const mats = layers.map((layer) =>
    new THREE.MeshBasicMaterial({
      color: 0x4aaeff,
      transparent: true,
      opacity: layer.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const isLightSquare = (file + rank) % 2 === 0;
      if (!isLightSquare) continue;

      const x = file - (OFFSET - 0.5);
      const z = rank - (OFFSET - 0.5);

      layers.forEach((layer, idx) => {
        const cell = new THREE.Mesh(squareGeo, mats[idx]);
        cell.rotation.x = -Math.PI / 2;
        cell.position.set(x, layer.y, z);
        cell.scale.setScalar(layer.scale);
        group.add(cell);
      });
    }
  }

  return group;
}

function createLightSquareDotOverlay(): THREE.Group {
  const group = new THREE.Group();
  const squareGeo = new THREE.PlaneGeometry(0.9, 0.9);
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = 64;
  patternCanvas.height = 64;
  const ctx = patternCanvas.getContext('2d');
  if (!ctx) return group;

  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(160, 228, 255, 0.92)';
  for (let y = 4; y < 64; y += 8) {
    for (let x = 4; x < 64; x += 8) {
      ctx.beginPath();
      ctx.arc(x, y, 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(patternCanvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const dotMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.33,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const isLightSquare = (file + rank) % 2 === 0;
      if (!isLightSquare) continue;

      const x = file - (OFFSET - 0.5);
      const z = rank - (OFFSET - 0.5);
      const overlay = new THREE.Mesh(squareGeo, dotMat);
      overlay.rotation.x = -Math.PI / 2;
      overlay.position.set(x, -0.0065, z);
      group.add(overlay);
    }
  }

  return group;
}

function createBoardSurface(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      darkColor: { value: new THREE.Color(0x020914) },
      lightColor: { value: new THREE.Color(0x0b2a45) },
      accentColor: { value: new THREE.Color(0x49b7ff) },
      dotDensity: { value: 18.0 }, // per square, tuned for clear micro-dot readability at game camera distance
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 darkColor;
      uniform vec3 lightColor;
      uniform vec3 accentColor;
      uniform float dotDensity;
      varying vec2 vUv;

      float edgePulse(float d, float width) {
        return 1.0 - smoothstep(width, width + 0.01, d);
      }

      void main() {
        vec2 board = vUv * 8.0;
        vec2 square = floor(board);
        vec2 squareUv = fract(board);
        float parity = mod(square.x + square.y, 2.0);
        float lightMask = parity;
        float darkMask = 1.0 - parity;

        vec3 base = mix(darkColor, lightColor, parity);

        vec2 cell = fract(board * dotDensity);
        float dist = length(cell - 0.5);
        float aa = fwidth(dist);
        float microDot = 1.0 - smoothstep(0.20 - aa, 0.42 + aa, dist);
        float lightMicroDot = microDot * lightMask;

        float gx = min(squareUv.x, 1.0 - squareUv.x);
        float gy = min(squareUv.y, 1.0 - squareUv.y);
        float majorGrid = max(edgePulse(gx, 0.02), edgePulse(gy, 0.02));

        vec2 centerUv = vUv * 2.0 - 1.0;
        float centerFalloff = 1.0 - clamp(dot(centerUv, centerUv) * 0.22, 0.0, 0.24);

        vec3 color = base;
        // Keep dark squares clean while pushing matrix texture/grid emphasis onto light squares.
        color *= 0.93 + darkMask * 0.02 + lightMicroDot * 0.08;
        color += vec3(0.03, 0.06, 0.1) * lightMask;
        color += vec3(0.11, 0.19, 0.28) * lightMicroDot;
        color -= vec3(0.03, 0.05, 0.08) * lightMask * (1.0 - microDot);
        color += accentColor * ((lightMask * 0.12) + lightMicroDot * 0.34 + (majorGrid * lightMask) * 0.2) * centerFalloff;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    transparent: false,
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8, 1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.01;
  mesh.renderOrder = -1;
  return mesh;
}

function pushBox(s: number): THREE.Vector3[] {
  return [
    new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0, -s),
    new THREE.Vector3(s, 0, -s),  new THREE.Vector3(s, 0, s),
    new THREE.Vector3(s, 0, s),   new THREE.Vector3(-s, 0, s),
    new THREE.Vector3(-s, 0, s),  new THREE.Vector3(-s, 0, -s),
  ];
}

function makeLines(points: THREE.Vector3[], color: number, opacity: number): THREE.LineSegments {
  return new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
}

function createTextSprite(text: string, fontSize = 32, canvasSize = 64): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize; canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `300 ${fontSize}px sans-serif`;
  ctx.fillStyle = '#66ccff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 6;
  ctx.fillText(text, canvasSize / 2, canvasSize / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
}

function createTitleSprite(text: string, width = 800): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '700 60px "Orbitron", sans-serif';
  ctx.fillStyle = '#66ccff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 12;
  ctx.fillText(text, width / 2, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  return new THREE.Mesh(
    new THREE.PlaneGeometry((width / 1024) * 5.0, 0.75),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
}

function addCoordinates(parent: THREE.Group, whiteName: string, blackName: string): void {
  const letters = ['A','B','C','D','E','F','G','H'];
  const numbers = ['1','2','3','4','5','6','7','8'];
  const yPos = -BOARD_THICKNESS + 0.01;
  const tabDist = (B2 + B3) / 2;
  const lineMat = new THREE.LineBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.5 });

  for (let i = 0; i < 8; i++) {
    const x = i - (OFFSET - 0.5);
    const tFront = createTextSprite(letters[i]);
    tFront.position.set(x, yPos, tabDist);
    tFront.rotation.x = -Math.PI / 2;
    parent.add(tFront);
    const tBack = createTextSprite(letters[7 - i]);
    tBack.position.set(x, yPos, -tabDist);
    tBack.rotation.x = -Math.PI / 2;
    tBack.rotation.z = Math.PI;
    parent.add(tBack);
    if (i < 7) {
      const hx = x + 0.5;
      const hpts = [
        new THREE.Vector3(hx, yPos, B2), new THREE.Vector3(hx, yPos, B3),
        new THREE.Vector3(hx, yPos, -B2), new THREE.Vector3(hx, yPos, -B3),
      ];
      parent.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hpts), lineMat));
    }
  }

  for (let i = 0; i < 8; i++) {
    const z = (OFFSET - 0.5) - i;
    const tRight = createTextSprite(numbers[7 - i]);
    tRight.position.set(tabDist, yPos, z);
    tRight.rotation.x = -Math.PI / 2;
    tRight.rotation.z = Math.PI / 2;
    parent.add(tRight);
    if (i < 7) {
      const hz = z - 0.5;
      parent.add(makeLines([new THREE.Vector3(B2, yPos, hz), new THREE.Vector3(B3, yPos, hz)], 0x44aaff, 0.5));
    }
  }

  const blackTitle = createTitleSprite(blackName.toUpperCase());
  blackTitle.position.set(-tabDist, yPos, -2.3);
  blackTitle.rotation.x = -Math.PI / 2;
  blackTitle.rotation.z = Math.PI / 2;
  parent.add(blackTitle);

  const whiteTitle = createTitleSprite(whiteName.toUpperCase(), 512);
  whiteTitle.position.set(-tabDist, yPos, 2.3);
  whiteTitle.rotation.x = -Math.PI / 2;
  whiteTitle.rotation.z = Math.PI / 2;
  parent.add(whiteTitle);
}

export function createBoard(scene: THREE.Scene, whiteName: string, blackName: string): { boardGroup: THREE.Group } {
  const masterGroup = new THREE.Group();
  const boardGroup = new THREE.Group();

  // Shader-first board substrate with fine dot-matrix detail.
  boardGroup.add(createBoardSurface());
  // Dedicated light-square micro-dot overlay for visible retro matrix texture.
  boardGroup.add(createLightSquareDotOverlay());
  // Soft transparent cell stack for subtle volumetric depth.
  boardGroup.add(createCellDepthStack());

  // Grid lines
  const gridPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    gridPts.push(new THREE.Vector3(-OFFSET, 0, i - OFFSET), new THREE.Vector3(OFFSET, 0, i - OFFSET));
    gridPts.push(new THREE.Vector3(i - OFFSET, 0, -OFFSET), new THREE.Vector3(i - OFFSET, 0, OFFSET));
  }
  boardGroup.add(makeLines(gridPts, 0x2288ff, 0.4));

  // Double outer border
  boardGroup.add(makeLines([...pushBox(B1), ...pushBox(B2)], 0x55aaff, 0.8));

  // Side pillars + rim layers
  const sidePts: THREE.Vector3[] = [];
  ([ [-B2,-B2],[B2,-B2],[B2,B2],[-B2,B2] ] as [number,number][]).forEach(([x, z]) => {
    sidePts.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, -BOARD_THICKNESS, z));
  });
  pushBox(B2).forEach(p => { const c = p.clone(); c.y = -BOARD_THICKNESS / 2; sidePts.push(c); });
  pushBox(B2).forEach(p => { const c = p.clone(); c.y = -BOARD_THICKNESS; sidePts.push(c); });
  pushBox(B3).forEach(p => { const c = p.clone(); c.y = -BOARD_THICKNESS; sidePts.push(c); });
  ([ [-1,-1],[1,-1],[1,1],[-1,1] ] as [number,number][]).forEach(([mx, mz]) => {
    sidePts.push(new THREE.Vector3(mx*B2, -BOARD_THICKNESS, mz*B2), new THREE.Vector3(mx*B3, -BOARD_THICKNESS, mz*B3));
  });
  boardGroup.add(makeLines(sidePts, 0x2288ff, 0.5));

  // Corner dot clusters
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
  const dotGeo = new THREE.PlaneGeometry(0.03, 0.03);
  const cornerTabOffset = B3 - 0.15;
  const yDot = -BOARD_THICKNESS + 0.01;
  for (const [cx, cz] of [[-cornerTabOffset, cornerTabOffset],[cornerTabOffset, cornerTabOffset],[-cornerTabOffset,-cornerTabOffset],[cornerTabOffset,-cornerTabOffset]] as [number,number][]) {
    const g = new THREE.Group();
    for (const dx of [-0.04, 0.04]) for (const dz of [-0.04, 0.04]) {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.position.set(dx, dz, 0);
      g.add(d);
    }
    g.position.set(cx, yDot, cz);
    g.rotation.x = -Math.PI / 2;
    boardGroup.add(g);
  }

  addCoordinates(boardGroup, whiteName, blackName);

  // Reflection — inverted clone, additive blending, faded
  const reflection = boardGroup.clone();
  reflection.scale.y = -1;
  reflection.position.y = -BOARD_THICKNESS - 0.01;
  reflection.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points)) return;
    const originalMaterial = child.material;
    const materialList = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
    const clonedMaterials = materialList.map((material) => {
      const clone = material.clone();
      clone.opacity = child instanceof THREE.Mesh ? 0.05 : clone.opacity * 0.15;
      clone.transparent = true;
      clone.blending = THREE.AdditiveBlending;
      return clone;
    });
    child.material = Array.isArray(originalMaterial) ? clonedMaterials : clonedMaterials[0];
  });

  masterGroup.add(boardGroup, reflection);
  scene.add(masterGroup);
  return { boardGroup };
}
