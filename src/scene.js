import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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

  const DotMatrixShader = {
    uniforms: {
      "tDiffuse": { value: null },
      "resolution": { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
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
        // Create 2x2 or 3x3 pixel grid mask
        vec2 grid = fract(vUv * (resolution / 2.5));
        float dotMask = step(0.3, grid.x) * step(0.3, grid.y);
        
        // Subtract from color to create gaps (dot mask)
        // Only apply noticeably to lit areas to preserve deep blacks
        float luma = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
        vec3 techFuzz = texel.rgb * (dotMask * 0.2 + 0.8);
        
        gl_FragColor = vec4(techFuzz, texel.a);
      }
    `
  };

  const dotMatrixPass = new ShaderPass(DotMatrixShader);

  const composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);
  composer.addPass(dotMatrixPass);

  // Add Starry Background
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 2000;
  const posArray = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 100;
  }
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  const starsMaterial = new THREE.PointsMaterial({
    size: 0.05,
    color: 0x88ccff,
    transparent: true,
    opacity: 0.8,
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
