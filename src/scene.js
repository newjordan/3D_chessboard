import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export function setupScene(container) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000510, 0.015);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Position camera to look down at the board like in the screenshot
  camera.position.set(0, 12, 16);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0); // Transparent to show body background or starry sky
  renderer.localClippingEnabled = true; // Enable clipping planes for piece destruction
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2.1; // Don't go below the board
  controls.target.set(0, 0, 0);

  // Post-processing (Bloom)
  const renderScene = new RenderPass(scene, camera);
  
  // Params: resolution, strength, radius, threshold
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.22, // strength - lowered by another 10%
    0.3, // radius
    0.25 // threshold
  );

  // GLSL 3, which is what WebGLRenderer compiles for WebGL 2. The mask is the
  // same 2.5-pixel grid as before: lit texels are dimmed slightly in the gaps.
  const dotMatrixMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
    vertexShader: `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      in vec2 vUv;
      out vec4 fragColor;
      void main() {
        vec4 texel = texture(tDiffuse, vUv);
        vec2 grid = fract(vUv * (resolution / 2.5));
        float dotMask = step(0.3, grid.x) * step(0.3, grid.y);
        vec3 techFuzz = texel.rgb * (dotMask * 0.2 + 0.8);
        fragColor = vec4(techFuzz, texel.a);
      }
    `,
  });

  const dotMatrixPass = new ShaderPass(dotMatrixMaterial);

  const composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);
  composer.addPass(dotMatrixPass);

  // Add Structured 3D Dot-Matrix Background
  const starsGeometry = new THREE.BufferGeometry();
  const posArray = [];
  const range = 50; 
  const step = 4.0;
  
  for (let x = -range; x <= range; x += step) {
    for (let y = -range; y <= range; y += step) {
      for (let z = -range; z <= range; z += step) {
        // Hollow out the central sphere so the dots don't obscure the actual chess board
        const distToCenter = Math.sqrt(x*x + y*y + z*z);
        if (distToCenter < 12) continue;
        posArray.push(x, y, z);
      }
    }
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArray), 3));
  const starsMaterial = new THREE.PointsMaterial({
    size: 0.08,
    color: 0x66aaff,
    transparent: true,
    opacity: 0.4,
  });
  const starMesh = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(starMesh);

  // Handle Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    dotMatrixPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, composer, controls };
}
