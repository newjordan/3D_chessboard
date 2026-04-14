import * as THREE from 'three';
import { gsap } from 'gsap';
import type { PieceInstance } from './types';
import { squareToXZ } from './squareUtils';

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
  const snapX = dx !== 0 ? start.x + (dx > 0 ? 0.5 : -0.5) : start.x;
  const snapZ = dz !== 0 ? start.z + (dz > 0 ? 0.5 : -0.5) : start.z;

  tl.to(lineMat, { opacity: 0, duration: 0.1 }, '+=0.1');
  tl.to(bracket.children[1].scale, { x: 2, y: 2, z: 2, duration: 0.1 }, '<');
  tl.to(bracket.position, { x: snapX, z: snapZ, duration: 0.1, ease: 'power1.inOut' });

  const targetX = dx !== 0 ? end.x + (dx > 0 ? -0.5 : 0.5) : end.x;
  const targetZ = dz !== 0 ? end.z + (dz > 0 ? -0.5 : 0.5) : end.z;
  const dist1 = Math.abs(snapZ - targetZ);
  const dist2 = Math.abs(snapX - targetX);
  const totalDist = dist1 + dist2;

  const tracePoints = [
    new THREE.Vector3(snapX, 0, snapZ),
    new THREE.Vector3(snapX, 0, targetZ),
    new THREE.Vector3(targetX, 0, targetZ),
  ];
  const traceGeo = new THREE.BufferGeometry().setFromPoints(tracePoints);
  const uvArr = new Float32Array([0, 0, totalDist > 0 ? dist1 / totalDist : 0, 0, 1, 0]);
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
        const split = dist1 / totalDist;
        if (head <= split) {
          bracket.position.x = snapX;
          bracket.position.z = THREE.MathUtils.lerp(snapZ, targetZ, split === 0 ? 1 : head / split);
        } else {
          bracket.position.x = THREE.MathUtils.lerp(snapX, targetX, (head - split) / (1 - split));
          bracket.position.z = targetZ;
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
    const c = child as any;
    if (c.material && c.type === 'LineSegments') {
      c.material = c.material.clone();
      c.material.color.setHex(0xff0022);
      c.material.clippingPlanes = [clipPlane];
    }
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
  onComplete: () => void
): void {
  const { x, z } = squareToXZ(toSquare);
  const tl = gsap.timeline({ onComplete });
  tl.to(instance.group.position, { x, z, duration: 0.5, ease: 'power1.inOut' }, 0);
  tl.to(instance.group.position, { y: 1.5, duration: 0.25, ease: 'power1.out', yoyo: true, repeat: 1 }, 0);
}
