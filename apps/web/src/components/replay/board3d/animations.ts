import * as THREE from 'three';
import { gsap } from 'gsap';
import type { PieceInstance } from './types';
import { squareToXZ } from './squareUtils';

let replayAnimationSpeed = 1;

export function setReplayAnimationSpeed(speedMultiplier: number): void {
  replayAnimationSpeed = Math.max(speedMultiplier, 0.25);
}

type LandingPulse = {
  group: THREE.Group;
  dotMesh: THREE.Mesh;
  dotMat: THREE.MeshBasicMaterial;
  ring: THREE.LineLoop;
  ringMat: THREE.LineBasicMaterial;
};

function createDotMatrixLandingPulse(color = 0x7dff00): LandingPulse {
  const group = new THREE.Group();

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rgb = new THREE.Color(color);
    const r = Math.round(rgb.r * 255);
    const g = Math.round(rgb.g * 255);
    const b = Math.round(rgb.b * 255);
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;
    for (let y = 4; y < 64; y += 8) {
      for (let x = 4; x < 64; x += 8) {
        ctx.beginPath();
        ctx.arc(x, y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const dotTex = new THREE.CanvasTexture(canvas);
  dotTex.minFilter = THREE.LinearFilter;
  dotTex.magFilter = THREE.LinearFilter;

  const dotMat = new THREE.MeshBasicMaterial({
    map: dotTex,
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const dotMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), dotMat);
  dotMesh.rotation.x = -Math.PI / 2;
  dotMesh.position.y = 0.03;
  dotMesh.renderOrder = 20;
  dotMesh.scale.setScalar(0.3);
  group.add(dotMesh);

  const ringMat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 40 }, (_, i) => {
        const a = (i / 40) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 0.18, 0.04, Math.sin(a) * 0.18);
      })
    ),
    ringMat
  );
  ring.renderOrder = 21;
  group.add(ring);

  return { group, dotMesh, dotMat, ring, ringMat };
}

export function animateTurnDestinationPing(
  toSquare: string,
  effectsGroup: THREE.Group,
  onComplete: () => void
): void {
  const { x, z } = squareToXZ(toSquare);
  const ping = createDotMatrixLandingPulse(0xc9f5ff);
  ping.group.position.set(x, 0, z);
  ping.dotMesh.position.y = 0.036;
  ping.dotMesh.scale.setScalar(0.98);
  ping.ring.scale.set(1.0, 1, 1.0);

  const flashPlateMat = new THREE.MeshBasicMaterial({
    color: 0x8bddff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
  const flashPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), flashPlateMat);
  flashPlate.rotation.x = -Math.PI / 2;
  flashPlate.position.y = 0.033;
  flashPlate.renderOrder = 19;
  ping.group.add(flashPlate);

  const frameMat = new THREE.LineBasicMaterial({
    color: 0xb7efff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.46, 0.038, -0.46),
      new THREE.Vector3(0.46, 0.038, -0.46),
      new THREE.Vector3(0.46, 0.038, 0.46),
      new THREE.Vector3(-0.46, 0.038, 0.46),
    ]),
    frameMat
  );
  frame.renderOrder = 22;
  ping.group.add(frame);
  effectsGroup.add(ping.group);

  const tl = gsap.timeline({ onComplete });
  tl.timeScale(Math.min(replayAnimationSpeed, 1.0));

  let disposed = false;
  const disposePing = () => {
    if (disposed) return;
    disposed = true;
    effectsGroup.remove(ping.group);
    ping.dotMesh.geometry.dispose();
    ping.dotMat.map?.dispose();
    ping.dotMat.dispose();
    ping.ring.geometry.dispose();
    ping.ringMat.dispose();
    flashPlate.geometry.dispose();
    flashPlateMat.dispose();
    frame.geometry.dispose();
    frameMat.dispose();
  };

  // Fast double flash: quick attention cue before the main move effects begin.
  tl.to(ping.dotMat, { opacity: 0.9, duration: 0.045, ease: 'power1.out' }, 0);
  tl.to(flashPlateMat, { opacity: 0.28, duration: 0.045, ease: 'power1.out' }, 0);
  tl.to(frameMat, { opacity: 0.82, duration: 0.045, ease: 'power1.out' }, 0);
  tl.to(ping.ringMat, { opacity: 0.55, duration: 0.045, ease: 'power1.out' }, 0);
  tl.to(ping.dotMesh.scale, { x: 1.08, y: 1.08, z: 1.08, duration: 0.12, ease: 'power1.out' }, 0);
  tl.to([ping.dotMat, flashPlateMat, frameMat, ping.ringMat], { opacity: 0, duration: 0.075, ease: 'power1.in' }, 0.09);

  tl.to(ping.dotMat, { opacity: 0.68, duration: 0.04, ease: 'power1.out' }, 0.19);
  tl.to(flashPlateMat, { opacity: 0.18, duration: 0.04, ease: 'power1.out' }, 0.19);
  tl.to(frameMat, { opacity: 0.58, duration: 0.04, ease: 'power1.out' }, 0.19);
  tl.to(ping.ringMat, { opacity: 0.34, duration: 0.04, ease: 'power1.out' }, 0.19);
  tl.to(ping.dotMesh.scale, { x: 1.18, y: 1.18, z: 1.18, duration: 0.14, ease: 'power1.out' }, 0.19);
  tl.to(ping.ring.scale, { x: 1.72, y: 1, z: 1.72, duration: 0.16, ease: 'power2.out' }, 0.19);
  tl.to([ping.dotMat, flashPlateMat, frameMat, ping.ringMat], { opacity: 0, duration: 0.12, ease: 'power1.in' }, 0.26);

  tl.call(disposePing, [], 0.44);
  tl.eventCallback('onInterrupt', disposePing);
}

function createBracket(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 1, depthTest: false });
  const pts: THREE.Vector3[] = [];
  const s = 0.45, l = 0.15;
  pts.push(new THREE.Vector3(-s,0,-s+l), new THREE.Vector3(-s,0,-s), new THREE.Vector3(-s+l,0,-s));
  pts.push(new THREE.Vector3(s-l,0,-s), new THREE.Vector3(s,0,-s), new THREE.Vector3(s,0,-s+l));
  pts.push(new THREE.Vector3(-s,0,s-l), new THREE.Vector3(-s,0,s), new THREE.Vector3(-s+l,0,s));
  pts.push(new THREE.Vector3(s-l,0,s), new THREE.Vector3(s,0,s), new THREE.Vector3(s,0,s-l));
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat));

  const dot = new THREE.Mesh(
    new THREE.PlaneGeometry(0.04, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 1, depthTest: false })
  );
  dot.rotation.x = -Math.PI / 2;
  group.add(dot);

  const ringMat = new THREE.LineDashedMaterial({ color: 0x00ffcc, dashSize: 0.1, gapSize: 0.05, transparent: true, opacity: 0.8, depthTest: false });
  const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.35, 32)), ringMat);
  ring.computeLineDistances();
  ring.rotation.x = -Math.PI / 2;
  const spinTween = gsap.to(ring.rotation, { z: Math.PI * 2, duration: 2.0, ease: 'none', repeat: -1 });
  group.userData.spinTween = spinTween;
  group.add(ring);

  return group;
}

export function animateLightningStrike(
  fromSquare: string,
  toSquare: string,
  boardGroup: THREE.Group,
  onComplete: () => void
): void {
  const start = squareToXZ(fromSquare);
  const end = squareToXZ(toSquare);
  const tl = gsap.timeline({ onComplete });
  tl.timeScale(replayAnimationSpeed);

  const bracket = createBracket();
  bracket.position.set(start.x, 0.1, start.z);
  bracket.scale.set(1.5, 1.5, 1.5);
  (bracket.children[0] as THREE.LineSegments).material = (bracket.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
  ((bracket.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = 0;
  ((bracket.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0;
  boardGroup.add(bracket);

  const lineMat = (bracket.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
  const dotMat = (bracket.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial;

  tl.to([lineMat, dotMat], { opacity: 1, duration: 0.1, ease: 'power2.in' }, 0);
  tl.to(bracket.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'back.out(1.5)' }, 0);

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const isDiagonalMove = dx !== 0 && dz !== 0 && Math.abs(dx) === Math.abs(dz);
  const snapX = dx !== 0 ? start.x + (dx > 0 ? 0.5 : -0.5) : start.x;
  const snapZ = dz !== 0 ? start.z + (dz > 0 ? 0.5 : -0.5) : start.z;

  tl.to(lineMat, { opacity: 0, duration: 0.1 }, '+=0.1');
  tl.to(bracket.children[1].scale, { x: 2, y: 2, z: 2, duration: 0.1 }, '<');
  tl.to(bracket.position, { x: snapX, z: snapZ, duration: 0.1, ease: 'power1.inOut' });

  const targetX = dx !== 0 ? end.x + (dx > 0 ? -0.5 : 0.5) : end.x;
  const targetZ = dz !== 0 ? end.z + (dz > 0 ? -0.5 : 0.5) : end.z;
  const dist1 = Math.abs(snapZ - targetZ);
  const dist2 = Math.abs(snapX - targetX);
  const totalDist = isDiagonalMove
    ? Math.hypot(targetX - snapX, targetZ - snapZ)
    : dist1 + dist2;

  const tracePoints = isDiagonalMove
    ? [
        new THREE.Vector3(snapX, 0, snapZ),
        new THREE.Vector3(targetX, 0, targetZ),
      ]
    : [
        new THREE.Vector3(snapX, 0, snapZ),
        new THREE.Vector3(snapX, 0, targetZ),
        new THREE.Vector3(targetX, 0, targetZ),
      ];
  const traceGeo = new THREE.BufferGeometry().setFromPoints(tracePoints);
  const uvArr = isDiagonalMove
    ? new Float32Array([0, 0, 1, 0])
    : new Float32Array([0, 0, totalDist > 0 ? dist1 / totalDist : 0, 0, 1, 0]);
  traceGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

  const traceMat = new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uLength: { value: 0.85 }, color: { value: new THREE.Color(0x00ffff) } },
    vertexShader: `varying float vUv; void main() { vUv = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uProgress; uniform float uLength; uniform vec3 color; varying float vUv;
      void main() {
        float dist = uProgress - vUv;
        if (dist >= 0.0 && dist <= uLength) {
          float alpha = pow(1.0 - (dist / uLength), 1.5);
          gl_FragColor = vec4(color * 3.0, alpha);
        } else { gl_FragColor = vec4(0.0); }
      }`,
    transparent: true, depthTest: false,
  });
  const traceLine = new THREE.Line(traceGeo, traceMat);
  traceLine.position.y = 0.05;
  boardGroup.add(traceLine);

  const proxy = { p: 0 };
  tl.to(proxy, {
    p: 1.85,
    duration: 1.2,
    ease: 'power1.inOut',
    onUpdate() {
      traceMat.uniforms.uProgress.value = proxy.p;
      const head = Math.min(proxy.p, 1.0);
      if (totalDist > 0) {
        if (isDiagonalMove) {
          bracket.position.x = THREE.MathUtils.lerp(snapX, targetX, head);
          bracket.position.z = THREE.MathUtils.lerp(snapZ, targetZ, head);
        } else {
          const split = dist1 / totalDist;
          if (head <= split) {
            bracket.position.x = snapX;
            bracket.position.z = THREE.MathUtils.lerp(snapZ, targetZ, split === 0 ? 1 : head / split);
          } else {
            bracket.position.x = THREE.MathUtils.lerp(snapX, targetX, (head - split) / (1 - split));
            bracket.position.z = targetZ;
          }
        }
      }
    },
  });

  tl.to(bracket.position, { x: end.x, z: end.z, duration: 0.1, ease: 'power1.inOut' });
  tl.to(lineMat, { opacity: 1, duration: 0.1 }, '<');
  tl.fromTo(bracket.scale, { x: 0.1, y: 0.1, z: 0.1 }, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'back.out(2)' }, '<');
  tl.to([lineMat, dotMat], { opacity: 0, duration: 0.2 }, '+=0.2');
  tl.call(() => {
    (bracket.userData.spinTween as gsap.core.Tween)?.kill();
    boardGroup.remove(bracket);
    boardGroup.remove(traceLine);
  });
}

export function animateCapture(
  instance: PieceInstance,
  boardGroup: THREE.Group,
  piecesContainer: THREE.Group,
  onComplete: () => void
): void {
  const px = instance.group.position.x;
  const pz = instance.group.position.z;
  const tl = gsap.timeline({ onComplete });
  tl.timeScale(replayAnimationSpeed);

  const borderMat = new THREE.LineBasicMaterial({ color: 0x00ff77, opacity: 0, transparent: true });
  const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.9)), borderMat);
  border.rotation.x = -Math.PI / 2;
  border.position.set(px, 0.03, pz);
  border.scale.set(0.1, 0.1, 0.1);
  boardGroup.add(border);
  tl.to(borderMat, { opacity: 1, duration: 0.1 }, 0);
  tl.to(border.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'power2.out' }, 0);

  const ghostMat = new THREE.LineBasicMaterial({ color: 0x00ff77, transparent: true, opacity: 0.8 });
  const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CircleGeometry(0.4, 32)), ghostMat);
  ghost.rotation.x = -Math.PI / 2;
  ghost.position.set(px, 0, pz);
  boardGroup.add(ghost);
  tl.to(ghost.position, { y: -2, duration: 0.8, ease: 'power1.in' }, 0.2);
  tl.to(ghost.scale, { x: 2, y: 2, z: 2, duration: 0.8 }, 0.2);
  tl.to(ghostMat, { opacity: 0, duration: 0.8 }, 0.2);

  tl.to(instance.haloMat, { opacity: 0, duration: 0.1 }, 0.3);
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5);
  instance.group.traverse(child => {
    if (!(child instanceof THREE.LineSegments)) return;
    const originalMaterial = child.material;
    const materialList = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
    const clonedMaterials = materialList.map((material) => {
      const clone = material.clone() as THREE.Material & { color?: THREE.Color };
      clone.color?.setHex(0xff0022);
      clone.clippingPlanes = [clipPlane];
      return clone;
    });
    child.material = Array.isArray(originalMaterial) ? clonedMaterials : clonedMaterials[0];
  });
  tl.to(instance.group.position, { y: -2, duration: 0.6, ease: 'power3.in' }, 0.3);

  const particleGroup = new THREE.Group();
  particleGroup.position.set(px, 0.02, pz);
  const dirs = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  for (let i = 0; i < 12; i++) {
    const pMat = new THREE.MeshBasicMaterial({ color: 0x00ff77, transparent: true, opacity: 1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), pMat);
    mesh.rotation.x = -Math.PI / 2;
    particleGroup.add(mesh);
    const d1 = dirs[Math.floor(Math.random() * 4)];
    const d2 = d1.x === 0
      ? [{ x: 1, z: 0 }, { x: -1, z: 0 }][Math.floor(Math.random() * 2)]
      : [{ x: 0, z: 1 }, { x: 0, z: -1 }][Math.floor(Math.random() * 2)];
    const dist1p = 0.5 + Math.floor(Math.random() * 2);
    const dist2p = 1.0 + Math.floor(Math.random() * 3);
    const pTl = gsap.timeline();
    pTl.timeScale(replayAnimationSpeed);
    pTl.to(mesh.position, { x: d1.x * dist1p, z: d1.z * dist1p, duration: dist1p * 0.15, ease: 'none' }, Math.random() * 0.2);
    pTl.to(mesh.position, { x: d1.x * dist1p + d2.x * dist2p, z: d1.z * dist1p + d2.z * dist2p, duration: dist2p * 0.15, ease: 'none' });
    pTl.to(pMat, { opacity: 0, duration: 0.3 }, '-=0.3');
  }
  boardGroup.add(particleGroup);

  const glitchObj = { val: 0.5 };
  tl.to(glitchObj, { val: 0.7, duration: 0.4, onUpdate() { clipPlane.constant = glitchObj.val + (Math.random() * 0.1 - 0.05); } }, 0.4);
  tl.to(border.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.2, ease: 'power2.in' }, 0.8);
  tl.to(borderMat, { opacity: 0, duration: 0.2 }, 0.8);
  tl.call(() => {
    piecesContainer.remove(instance.group);
    piecesContainer.remove(instance.haloGroup);
    boardGroup.remove(border);
    boardGroup.remove(ghost);
    boardGroup.remove(particleGroup);
  });
}

export function animateJump(
  instance: PieceInstance,
  toSquare: string,
  effectsGroup: THREE.Group,
  onComplete: () => void
): void {
  const { x, z } = squareToXZ(toSquare);
  const tl = gsap.timeline({ onComplete });
  tl.timeScale(replayAnimationSpeed);
  const haloOriginalColor = instance.haloMat.color.clone();
  const haloOriginalOpacity = instance.haloMat.opacity;

  // Thin transient neon outline on the moving piece.
  const sourceLine = instance.group.children.find((child) => child.type === 'LineSegments') as THREE.LineSegments | undefined;
  const sourceMat = sourceLine?.material as THREE.LineBasicMaterial | undefined;
  const sourceOriginalColor = sourceMat?.color.clone();
  const sourceOriginalOpacity = sourceMat?.opacity ?? 1;
  let outline: THREE.LineSegments | null = null;
  let outlineMat: THREE.LineBasicMaterial | null = null;
  let moveRing: THREE.LineLoop | null = null;
  let moveRingMat: THREE.LineBasicMaterial | null = null;
  if (sourceLine?.geometry) {
    outlineMat = new THREE.LineBasicMaterial({
      color: 0x7dff00,
      transparent: true,
      opacity: 0,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    outline = new THREE.LineSegments(sourceLine.geometry, outlineMat);
    outline.scale.setScalar(1.09);
    outline.renderOrder = 10;
    instance.group.add(outline);
    tl.to(outlineMat, { opacity: 1.0, duration: 0.06, ease: 'power1.out' }, 0);
  }

  moveRingMat = new THREE.LineBasicMaterial({
    color: 0x7dff00,
    transparent: true,
    opacity: 0,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  moveRing = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 0.36, 0.06, Math.sin(a) * 0.36);
    })
  ), moveRingMat);
  moveRing.renderOrder = 11;
  instance.group.add(moveRing);
  tl.to(moveRingMat, { opacity: 1.0, duration: 0.08, ease: 'power1.out' }, 0);

  instance.haloGroup.visible = true;
  instance.haloMat.color.setHex(0x7dff00);
  tl.to(instance.haloMat, { opacity: 1.0, duration: 0.08, ease: 'power1.out' }, 0);

  if (sourceMat && sourceOriginalColor) {
    tl.to(sourceMat.color, {
      r: 0.0,
      g: 1.0,
      b: 0.4,
      duration: 0.06,
      ease: 'power1.out',
    }, 0);
    tl.to(sourceMat, { opacity: 1.0, duration: 0.06, ease: 'power1.out' }, 0);
  }

  tl.to(instance.group.position, { x, z, duration: 0.5, ease: 'power1.inOut' }, 0);
  tl.to(instance.group.position, { y: 1.5, duration: 0.25, ease: 'power1.out', yoyo: true, repeat: 1 }, 0);

  const landingPulse = createDotMatrixLandingPulse();
  landingPulse.group.position.set(x, 0, z);
  landingPulse.group.visible = false;
  effectsGroup.add(landingPulse.group);
  tl.call(() => {
    landingPulse.group.visible = true;
  }, [], 0.44);
  tl.to(landingPulse.dotMat, { opacity: 0.6, duration: 0.08, ease: 'power1.out' }, 0.44);
  tl.to(landingPulse.dotMesh.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 0.3, ease: 'power2.out' }, 0.44);
  tl.to(landingPulse.dotMat, { opacity: 0.0, duration: 0.26, ease: 'power1.in' }, 0.52);
  tl.to(landingPulse.ringMat, { opacity: 0.45, duration: 0.06, ease: 'power1.out' }, 0.44);
  tl.to(landingPulse.ring.scale, { x: 2.2, y: 1, z: 2.2, duration: 0.26, ease: 'power2.out' }, 0.44);
  tl.to(landingPulse.ringMat, { opacity: 0, duration: 0.2, ease: 'power1.in' }, 0.5);

  let landingPulseDisposed = false;
  const disposeLandingPulse = () => {
    if (landingPulseDisposed) return;
    landingPulseDisposed = true;
    effectsGroup.remove(landingPulse.group);
    landingPulse.dotMesh.geometry.dispose();
    landingPulse.dotMat.map?.dispose();
    landingPulse.dotMat.dispose();
    landingPulse.ring.geometry.dispose();
    landingPulse.ringMat.dispose();
  };
  tl.call(disposeLandingPulse, [], 0.82);
  if (outlineMat) {
    tl.to(outlineMat, { opacity: 0.95, duration: 1.6, ease: 'none' }, 0.06);
    tl.to(outlineMat, { opacity: 0.0, duration: 0.9, ease: 'power1.in' }, 1.66);
    tl.call(() => {
      if (outline) instance.group.remove(outline);
      outlineMat?.dispose();
    });
  }

  if (moveRingMat) {
    tl.to(moveRingMat, { opacity: 0.95, duration: 1.6, ease: 'none' }, 0.08);
    tl.to(moveRingMat, { opacity: 0, duration: 0.9, ease: 'power1.in' }, 1.68);
    tl.call(() => {
      if (moveRing) {
        instance.group.remove(moveRing);
        moveRing.geometry.dispose();
      }
      moveRingMat?.dispose();
    });
  }

  tl.to(instance.haloMat, { opacity: 0.95, duration: 1.6, ease: 'none' }, 0.08);
  tl.to(instance.haloMat, { opacity: 0, duration: 0.9, ease: 'power1.in' }, 1.68);
  tl.call(() => {
    instance.haloGroup.visible = false;
    instance.haloMat.color.copy(haloOriginalColor);
    instance.haloMat.opacity = haloOriginalOpacity;
  });

  if (sourceMat && sourceOriginalColor) {
    tl.to(sourceMat.color, {
      r: sourceOriginalColor.r,
      g: sourceOriginalColor.g,
      b: sourceOriginalColor.b,
      duration: 0.9,
      ease: 'power1.in',
    }, 1.68);
    tl.to(sourceMat, { opacity: sourceOriginalOpacity, duration: 0.9, ease: 'power1.in' }, 1.68);
  }

  tl.eventCallback('onInterrupt', disposeLandingPulse);
}
