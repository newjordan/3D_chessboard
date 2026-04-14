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

      // 4. Grid Crawl: Double Pincer Path (Ride the closest rail into town!)
      // The target corner MUST be the PRECEDING edge relative to travel direction, not the far edge!
      const targetCornerX = endPos.x + (dx > 0 ? -0.5 : 0.5);
      const targetCornerZ = endPos.z + (dz > 0 ? -0.5 : 0.5);

      let p1 = [], p2 = [];
      if (Math.abs(dx) > 0.1 && Math.abs(dz) > 0.1) {
          // Diagonal/Knight: Trace exact rectangular perimeter using the near/inside rails!
          p1 = [
             new THREE.Vector3(snapCornerX, 0, snapCornerZ),
             new THREE.Vector3(snapCornerX, 0, targetCornerZ),
             new THREE.Vector3(targetCornerX, 0, targetCornerZ)
          ];
          p2 = [
             new THREE.Vector3(snapCornerX, 0, snapCornerZ),
             new THREE.Vector3(targetCornerX, 0, snapCornerZ),
             new THREE.Vector3(targetCornerX, 0, targetCornerZ)
          ];
      } else if (Math.abs(dx) < 0.1) {
          // Pure Z move (Vertical) -> Trace exactly down the left and right rails of the squares
          const railL = startPos.x - 0.5;
          const railR = startPos.x + 0.5;
          p1 = [
             new THREE.Vector3(railL, 0, snapCornerZ),
             new THREE.Vector3(railL, 0, targetCornerZ)
          ];
          p2 = [
             new THREE.Vector3(railR, 0, snapCornerZ),
             new THREE.Vector3(railR, 0, targetCornerZ)
          ];
      } else {
          // Pure X move (Horizontal) -> Trace exactly along the top and bottom rails
          const railT = startPos.z - 0.5;
          const railB = startPos.z + 0.5;
          p1 = [
             new THREE.Vector3(snapCornerX, 0, railT),
             new THREE.Vector3(targetCornerX, 0, railT)
          ];
          p2 = [
             new THREE.Vector3(snapCornerX, 0, railB),
             new THREE.Vector3(targetCornerX, 0, railB)
          ];
      }

      const createTrace = (points) => {
         let tDist = 0;
         const dists = [0];
         for(let i=1; i<points.length; i++) {
             tDist += points[i].distanceTo(points[i-1]);
             dists.push(tDist);
         }
         const uvs = new Float32Array(points.length * 2);
         for(let i=0; i<points.length; i++) {
             uvs[i*2] = dists[i] / tDist;
             uvs[i*2+1] = 0;
         }
         
         const geo = new THREE.BufferGeometry().setFromPoints(points);
         geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
         
         const mat = new THREE.ShaderMaterial({
            uniforms: {
               uProgress: { value: 0.0 },
               uLength: { value: 0.95 }, // Super long tails for the wide traces
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
                    float alpha = pow(1.0 - (dist / uLength), 1.2);
                    // Extremely bright high-voltage bloom multiplier
                    gl_FragColor = vec4(color * 4.0, alpha);
                 } else {
                    gl_FragColor = vec4(0.0);
                 }
               }
            `,
            transparent: true,
            depthTest: false
         });
         const line = new THREE.Line(geo, mat);
         line.position.y = 0.03;
         return { line, mat, tDist };
      };

      const trace1 = createTrace(p1);
      const trace2 = createTrace(p2);
      
      boardGroup.add(trace1.line);
      boardGroup.add(trace2.line);

      // Crawl slowly along the path
      tl.to([trace1.mat.uniforms.uProgress, trace2.mat.uniforms.uProgress], {
        value: 1.0 + Math.max(trace1.mat.uniforms.uLength.value, trace2.mat.uniforms.uLength.value), 
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
      tl.to([trace1.mat, trace2.mat], { opacity: 0, transparent: true, duration: 0.2 }, "<");
      
      tl.call(() => {
        boardGroup.remove(bracket);
        boardGroup.remove(trace1.line);
        boardGroup.remove(trace2.line);
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
            c.material.color.setHex(0xff0022); // Deep glowing red
            c.material.clippingPlanes = [clipPlane];
         }
      });

      tl.to(piece.position, { y: -2, duration: 0.6, ease: "power3.in" }, 0.3);
      
      // Particle Burst on Death (Orthogonal grid flow / Circuit burst)
      const particleGeo = new THREE.PlaneGeometry(0.04, 0.04); 
      const particleGroup = new THREE.Group();
      particleGroup.position.set(px, 0.02, pz); // Set just above grid floor so they lie on it
      
      const directions = [
         {x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: 1}, {x: 0, z: -1}
      ];

      for(let i=0; i<12; i++) {
         const mat = new THREE.MeshBasicMaterial({ color: 0x00ff77, transparent: true, opacity: 1, side: THREE.DoubleSide });
         const mesh = new THREE.Mesh(particleGeo, mat);
         mesh.rotation.x = -Math.PI / 2; // Flat on the grid
         particleGroup.add(mesh);
         
         const dir1 = directions[Math.floor(Math.random() * directions.length)];
         // Orthogonal turn for the second leg of the journey
         const dir2 = (dir1.x === 0) ? 
                [{x: 1, z: 0}, {x: -1, z: 0}][Math.floor(Math.random()*2)] : 
                [{x: 0, z: 1}, {x: 0, z: -1}][Math.floor(Math.random()*2)];
         
         // First leg moves it exactly 0.5 (to the grid line boundary), or 1.5 (next grid line)
         const dist1 = 0.5 + Math.floor(Math.random() * 2); 
         // Second leg shoots down the intersection line
         const dist2 = 1.0 + Math.floor(Math.random() * 3);

         const pTl = gsap.timeline();
         
         // 1. Zoom to grid intersection
         pTl.to(mesh.position, {
             x: dir1.x * dist1,
             z: dir1.z * dist1,
             duration: dist1 * 0.15,
             ease: "none"
         }, Math.random() * 0.2); // Stagger start sequence
         
         // 2. Snap 90 degrees and race down intersecting grid line
         pTl.to(mesh.position, {
             x: (dir1.x * dist1) + (dir2.x * dist2),
             z: (dir1.z * dist1) + (dir2.z * dist2),
             duration: dist2 * 0.15,
             ease: "none"
         });
         
         // 3. Dissipate/Fade out into the grid
         pTl.to(mat, {
             opacity: 0,
             duration: 0.3
         }, "-=0.3");
      }
      boardGroup.add(particleGroup);
      
      // Plunge cleanup after max timeline length
      tl.to(particleGroup.position, { y: -1, duration: 0.2 }, "+=1.5"); 

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
