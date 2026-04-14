import * as THREE from 'three';
import { gsap } from 'gsap';

export function createAnimationsContext(scene, boardGroup, piecesContainer, offset) {
  
  // Creates an OpenCV style bracket group
  const createBracket = () => {
    const bGroup = new THREE.Group();
    const bMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 1, depthTest: false });
    const bGeo = new THREE.BufferGeometry();
    const p = [];
    const s = 0.45;
    const l = 0.15; // bracket length
    
    // Top-Left
    p.push(new THREE.Vector3(-s, 0, -s+l), new THREE.Vector3(-s, 0, -s), new THREE.Vector3(-s+l, 0, -s));
    // Top-Right
    p.push(new THREE.Vector3(s-l, 0, -s), new THREE.Vector3(s, 0, -s), new THREE.Vector3(s, 0, -s+l));
    // Bottom-Left
    p.push(new THREE.Vector3(-s, 0, s-l), new THREE.Vector3(-s, 0, s), new THREE.Vector3(-s+l, 0, s));
    // Bottom-Right
    p.push(new THREE.Vector3(s-l, 0, s), new THREE.Vector3(s, 0, s), new THREE.Vector3(s, 0, s-l));
    
    bGeo.setFromPoints(p);
    bGroup.add(new THREE.LineSegments(bGeo, bMat));
    
    // Crosshair dot
    const cGeo = new THREE.PlaneGeometry(0.04, 0.04);
    const cMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 1, depthTest: false });
    const cross = new THREE.Mesh(cGeo, cMat);
    cross.rotation.x = -Math.PI / 2;
    bGroup.add(cross);
    
    // Rotating Dashed Targeting Ring
    const borderMat = new THREE.LineDashedMaterial({ color: 0x00ffcc, dashSize: 0.1, gapSize: 0.05, transparent: true, opacity: 0.8, depthTest: false });
    const circleGeo = new THREE.EdgesGeometry(new THREE.CircleGeometry(0.35, 32));
    const ring = new THREE.LineSegments(circleGeo, borderMat);
    ring.computeLineDistances();
    ring.rotation.x = -Math.PI / 2;
    
    // Animate the ring spinning infinitely while the bracket is alive
    gsap.to(ring.rotation, {
      z: Math.PI * 2,
      duration: 2.0,
      ease: "none",
      repeat: -1
    });
    
    bGroup.add(ring);
    
    return bGroup;
  };

  const getPositionFromCoords = (rank, file) => {
    return {
      x: file * 1 - (offset - 0.5),
      z: (offset - 0.5) - (rank * 1),
      y: 0
    };
  };

  return {
    animateLightningStrike: (startRank, startFile, endRank, endFile, onComplete) => {
      const tl = gsap.timeline({ onComplete });
      
      const startPos = getPositionFromCoords(startRank, startFile);
      const endPos = getPositionFromCoords(endRank, endFile);

      // 1. Target Acquisition (Origin Bracket)
      const bracket = createBracket();
      bracket.position.set(startPos.x, Math.max(0.1, bracket.position.y), startPos.z);
      bracket.scale.set(1.5, 1.5, 1.5);
      bracket.children[0].material.opacity = 0; // line segments
      bracket.children[1].material.opacity = 0; // center point
      boardGroup.add(bracket);

      tl.to([bracket.children[0].material, bracket.children[1].material], {
        opacity: 1,
        duration: 0.1,
        ease: "power2.in"
      }, 0);
      
      tl.to(bracket.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.2,
        ease: "back.out(1.5)"
      }, 0);

      // 2 & 3. Energy Compression -> Nearest Corner
      const dx = endPos.x - startPos.x;
      const dz = endPos.z - startPos.z;
      const snapCornerX = startPos.x + (dx > 0 ? 0.5 : -0.5);
      const snapCornerZ = startPos.z + (dz > 0 ? 0.5 : -0.5);
      
      tl.to(bracket.children[0].material, { opacity: 0, duration: 0.1 }, "+=0.1"); // fade brackets leaving dot
      tl.to(bracket.children[1].scale, { x: 2, y: 2, z: 2, duration: 0.1 }, "<"); // dot absorbs energy

      tl.to(bracket.position, {
        x: snapCornerX,
        z: snapCornerZ,
        duration: 0.1,
        ease: "power1.inOut"
      });

      // 4. Grid Crawl (Manhattan routing with dragging tail Shader)
      const targetCornerX = endPos.x + (dx > 0 ? 0.5 : -0.5);
      const targetCornerZ = endPos.z + (dz > 0 ? 0.5 : -0.5);

      const dist1 = Math.abs(targetCornerZ - snapCornerZ);
      const dist2 = Math.abs(targetCornerX - snapCornerX);
      const totalDist = dist1 + dist2;

      const tracePoints = [
        new THREE.Vector3(snapCornerX, 0, snapCornerZ),
        new THREE.Vector3(snapCornerX, 0, targetCornerZ),
        new THREE.Vector3(targetCornerX, 0, targetCornerZ)
      ];

      const traceGeo = new THREE.BufferGeometry().setFromPoints(tracePoints);
      const uvs = new Float32Array([
        0, 0,
        (totalDist === 0) ? 0 : (dist1/totalDist), 0,
        1, 0
      ]);
      traceGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

      const traceMat = new THREE.ShaderMaterial({
        uniforms: {
           uProgress: { value: 0.0 },
           uLength: { value: 0.85 }, // 85% trailing length for massive electricity drag
           color: { value: new THREE.Color(0x00ffff) }
        },
        vertexShader: `
           varying float vUv;
           void main() {
             vUv = uv.x;
             gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
           }
        `,
        fragmentShader: `
           uniform float uProgress;
           uniform float uLength;
           uniform vec3 color;
           varying float vUv;
           void main() {
             float dist = uProgress - vUv;
             if (dist >= 0.0 && dist <= uLength) {
                // Non-linear fade so the head is extremely bright and the tail lingers
                float alpha = pow(1.0 - (dist / uLength), 1.5);
                // Multiplying color by 3.0 to severely trigger the UnrealBloomPass
                gl_FragColor = vec4(color * 3.0, alpha);
             } else {
                gl_FragColor = vec4(0.0);
             }
           }
        `,
        transparent: true,
        depthTest: false
      });

      const traceLine = new THREE.Line(traceGeo, traceMat);
      traceLine.position.y = 0.05;
      boardGroup.add(traceLine);

      // Crawl slowly along the path
      tl.to(traceMat.uniforms.uProgress, {
        value: 1.0 + 0.85, // 1.0 + new length
        duration: 1.2,
        ease: "power1.inOut"
      });

      tl.to(bracket.position, { x: targetCornerX, z: targetCornerZ, duration: 1.2, ease: "power1.inOut" }, "<");

      // 5. Target Lock (Destination Bracket explodes out)
      tl.to(bracket.position, { x: endPos.x, z: endPos.z, duration: 0.1, ease: "power1.inOut" });
      
      tl.to(bracket.children[0].material, { opacity: 1, duration: 0.1 }, "<");
      tl.fromTo(bracket.scale, { x: 0.1, y: 0.1, z: 0.1 }, { x: 1, y: 1, z: 1, duration: 0.2, ease: "back.out(2)" }, "<");

      // Cleanup Flash
      tl.to([bracket.children[0].material, bracket.children[1].material], { opacity: 0, duration: 0.2 }, "+=0.2");
      tl.to(traceMat, { opacity: 0, transparent: true, duration: 0.2 }, "<");
      
      tl.call(() => {
        boardGroup.remove(bracket);
        boardGroup.remove(traceLine);
      });
    },

    animateCapture: (piece, onComplete) => {
      const tl = gsap.timeline({ onComplete });
      
      const px = piece.position.x;
      const pz = piece.position.z;
      
      // 1. Highlight the square in a green border, starting small, expanding to edge
      const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.9, 0.9));
      const borderMat = new THREE.LineBasicMaterial({ color: 0x00ff77, opacity: 0, transparent: true });
      const border = new THREE.LineSegments(borderGeo, borderMat);
      border.rotation.x = -Math.PI / 2;
      border.position.set(px, 0.03, pz);
      border.scale.set(0.1, 0.1, 0.1);
      boardGroup.add(border);

      tl.to(borderMat, { opacity: 1, duration: 0.1 }, 0);
      tl.to(border.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: "power2.out" }, 0);

      // 2. Ghost circle dropping to -y
      const ghostGeo = new THREE.EdgesGeometry(new THREE.CircleGeometry(0.4, 32));
      const ghostMat = new THREE.LineBasicMaterial({ color: 0x00ff77, transparent: true, opacity: 0.8 });
      const ghostRing = new THREE.LineSegments(ghostGeo, ghostMat);
      ghostRing.rotation.x = -Math.PI / 2;
      ghostRing.position.set(px, 0, pz);
      boardGroup.add(ghostRing);
      
      tl.to(ghostRing.position, { y: -2, duration: 0.8, ease: "power1.in" }, 0.2);
      tl.to(ghostRing.scale, { x: 2, y: 2, z: 2, duration: 0.8 }, 0.2);
      tl.to(ghostMat, { opacity: 0, duration: 0.8 }, 0.2);

      // 3. Piece falls down once border hits the edge
      tl.to(piece.userData.haloMat, { opacity: 0, duration: 0.1 }, 0.3);
      
      // We will clone the piece materials to apply a local clipping plane just for this dying piece!
      const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.5); // Cuts off anything below y = -0.5
      piece.traverse(c => {
         if (c.material && c.type === 'LineSegments') {
            c.material = c.material.clone();
            c.material.clippingPlanes = [clipPlane];
         }
      });

      tl.to(piece.position, { y: -2, duration: 0.6, ease: "power3.in" }, 0.3);
      
      // Particle Burst on Death (Sparse, varied vertical glitch needles)
      // Dropped size by 65%, stretched Y by 20%, switched to BoxGeometry so they don't lie flat
      const particleGeo = new THREE.BoxGeometry(0.012, 0.15, 0.012); 
      const particles = [];
      const particleGroup = new THREE.Group();
      particleGroup.position.set(px, 0, pz); // Set base at square center
      
      // Reduce count massively to 8
      for(let i=0; i<8; i++) {
         const mat = new THREE.MeshBasicMaterial({ color: 0x00ff77, transparent: true, opacity: 0 });
         const mesh = new THREE.Mesh(particleGeo, mat);
         const gridX = (Math.floor(Math.random() * 7) - 3) * 0.12;
         const gridZ = (Math.floor(Math.random() * 7) - 3) * 0.12;
         const startY = 0.5 + Math.random() * 2.5; // Huge spawn height variance
         
         mesh.position.set(gridX, startY, gridZ);
         
         mesh.userData = { 
             speed: 1.0 + Math.random() * 3.0,     // Wild speed variance
             startDelay: Math.random() * 0.4,      // Staggered start timings (proxy t is 0->1)
             flickerFreq: Math.random() * 0.1 + 0.02
         }; 
         
         particleGroup.add(mesh);
         particles.push(mesh);
      }
      boardGroup.add(particleGroup);
      
      const pProxy = { t: 0 };
      tl.to(pProxy, {
         t: 1,
         duration: 1.2, // Let the glitch breathe for a long second
         ease: "none",
         onUpdate: () => {
             particles.forEach(p => {
                // Staggered entry logic
                if (pProxy.t < p.userData.startDelay) return;

                p.position.y -= p.userData.speed * 0.02; // Vertical drop
                
                // Infinite Loop physics with variance reset
                if (p.position.y < -0.5) {
                    p.position.y = 0.5 + Math.random() * 1.5;
                    p.userData.speed = 1.0 + Math.random() * 3.0; // Randomize drop speed again
                }
                
                // Gradient transparency based on vertical height
                const fade = Math.max(0, Math.min(1, (p.position.y + 0.2) / 0.8));
                p.material.opacity = fade * 0.9;
                
                // Asynchronous Dialtone Glitch flicker
                if (Math.random() < p.userData.flickerFreq) {
                    p.scale.setScalar(Math.random() > 0.4 ? 1 : 0);
                }
             });
         }
      }, 0.2); // Dialtone fires up as piece drops
      
      // Plunge clean up
      tl.to(particleGroup.position, { y: -1, duration: 0.2 }, 1.2); 

      // Glitch Touch at lower Y border (wobbles the clipping plane dynamically)
      const glitchObj = { val: 0.5 };
      tl.to(glitchObj, {
         val: 0.7, 
         duration: 0.4, 
         onUpdate: () => {
             // Randomly fluctuate the plane to simulate a "glitch touch" as it passes the floor
             clipPlane.constant = glitchObj.val + (Math.random() * 0.1 - 0.05);
         }
      }, 0.4);

      // Wait until the piece falls below the border, then shrink the square
      tl.to(border.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.2, ease: "power2.in" }, 0.8);
      tl.to(borderMat, { opacity: 0, duration: 0.2 }, 0.8);

      tl.call(() => {
         piecesContainer.remove(piece);
         boardGroup.remove(border);
         boardGroup.remove(ghostRing);
         boardGroup.remove(particleGroup);
      });
    },

    animateJump: (piece, endRank, endFile, onComplete) => {
      const endPos = getPositionFromCoords(endRank, endFile);
      const tl = gsap.timeline({ onComplete });
      
      // Jump arc
      tl.to(piece.position, {
        x: endPos.x,
        z: endPos.z,
        duration: 0.5,
        ease: "power1.inOut"
      }, 0);
      
      tl.to(piece.position, {
        y: 1.5,
        duration: 0.25,
        ease: "power1.out",
        yoyo: true,
        repeat: 1
      }, 0);
      
      // Update piece memory
      tl.call(() => {
        piece.userData.rank = endRank;
        piece.userData.file = endFile;
      });
    }
  };
}
