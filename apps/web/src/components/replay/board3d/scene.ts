import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { SceneContext } from './types';

const DotMatrixShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 grid = fract(vUv * (resolution / 2.5));
      float dotMask = step(0.3, grid.x) * step(0.3, grid.y);
      vec3 techFuzz = texel.rgb * (dotMask * 0.2 + 0.8);
      gl_FragColor = vec4(techFuzz, texel.a);
    }
  `,
};

export function setupScene(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000510, 0.015);

  const w = canvas.clientWidth || 800;
  const h = canvas.clientHeight || 600;

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 12, 16);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.minDistance = 8;
  controls.maxDistance = 20;
  controls.target.set(0, 0, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.3, 0.25));
  const dotPass = new ShaderPass(DotMatrixShader);
  dotPass.uniforms.resolution.value.set(w, h);
  composer.addPass(dotPass);

  // Structured dot-matrix starfield
  const starPositions: number[] = [];
  for (let x = -50; x <= 50; x += 4) {
    for (let y = -50; y <= 50; y += 4) {
      for (let z = -50; z <= 50; z += 4) {
        if (Math.sqrt(x * x + y * y + z * z) < 12) continue;
        starPositions.push(x, y, z);
      }
    }
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starPositions), 3));
  scene.add(new THREE.Points(starsGeo, new THREE.PointsMaterial({ size: 0.08, color: 0x66aaff, transparent: true, opacity: 0.4 })));

  const ro = new ResizeObserver(() => {
    const rw = canvas.clientWidth;
    const rh = canvas.clientHeight;
    if (rw === 0 || rh === 0) return;
    camera.aspect = rw / rh;
    camera.updateProjectionMatrix();
    renderer.setSize(rw, rh);
    composer.setSize(rw, rh);
    dotPass.uniforms.resolution.value.set(rw, rh);
  });
  ro.observe(canvas.parentElement ?? canvas);

  return {
    scene,
    camera,
    renderer,
    composer,
    controls,
    dispose() {
      ro.disconnect();
      controls.dispose();
      composer.renderTarget1.dispose();
      composer.renderTarget2.dispose();
      renderer.dispose();
    },
  };
}
