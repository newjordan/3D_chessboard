import * as THREE from 'three';

const OFFSET = 4; // half of 8 squares
const BOARD_THICKNESS = 0.5;
const B1 = OFFSET + 0.08;
const B2 = OFFSET + 0.3;
const B3 = B2 + 0.6;

function createBoardSurface(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      darkColor: { value: new THREE.Color(0x020914) },
      lightColor: { value: new THREE.Color(0x061223) },
      accentColor: { value: new THREE.Color(0x49b7ff) },
      dotDensity: { value: 34.0 }, // per square, tuned for a fine micro-matrix
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

        vec3 base = mix(darkColor, lightColor, parity);

        vec2 cell = fract(board * dotDensity);
        float dist = length(cell - 0.5);
        float aa = fwidth(dist);
        float microDot = 1.0 - smoothstep(0.16 - aa, 0.33 + aa, dist);

        float gx = min(squareUv.x, 1.0 - squareUv.x);
        float gy = min(squareUv.y, 1.0 - squareUv.y);
        float majorGrid = max(edgePulse(gx, 0.02), edgePulse(gy, 0.02));

        vec2 centerUv = vUv * 2.0 - 1.0;
        float centerFalloff = 1.0 - clamp(dot(centerUv, centerUv) * 0.22, 0.0, 0.24);

        vec3 color = base;
        color *= 0.90 + microDot * 0.16;
        color += accentColor * (microDot * 0.11 + majorGrid * 0.22) * centerFalloff;

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
    const c = child as any;
    if (c.material) {
      c.material = c.material.clone();
      c.material.opacity = c.isMesh ? 0.05 : c.material.opacity * 0.15;
      c.material.transparent = true;
      c.material.blending = THREE.AdditiveBlending;
    }
  });

  masterGroup.add(boardGroup, reflection);
  scene.add(masterGroup);
  return { boardGroup };
}
