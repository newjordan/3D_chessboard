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

      // 4. Grid Crawl (Manhattan routing)
      const targetCornerX = endPos.x + (dx > 0 ? 0.5 : -0.5);
      const targetCornerZ = endPos.z + (dz > 0 ? 0.5 : -0.5);

      // Tracing line
      const traceGeo = new THREE.BufferGeometry();
      const traceMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, linewidth: 2 });
      const traceLine = new THREE.Line(traceGeo, traceMat);
      traceLine.position.y = 0.05;
      boardGroup.add(traceLine);

      let tracePoints = [new THREE.Vector3(snapCornerX, 0, snapCornerZ)];
      traceGeo.setFromPoints(tracePoints);

      // Trace logic
      const proxy = { x: snapCornerX, z: snapCornerZ };

      const traceUpdate = () => {
         tracePoints.push(new THREE.Vector3(proxy.x, 0, proxy.z));
         traceGeo.setFromPoints(tracePoints);
      };

      // Crawl Z first, then X (or parallel/staggered)
      tl.to(proxy, {
        z: targetCornerZ,
        duration: 0.2,
        ease: "none",
        onUpdate: traceUpdate
      });
      tl.to(proxy, {
        x: targetCornerX,
        duration: 0.2,
        ease: "none",
        onUpdate: traceUpdate
      });

      tl.to(bracket.position, { x: targetCornerX, z: targetCornerZ, duration: 0.4, ease: "none" }, "-=0.4");

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
      
      // Halo violently vanishes
      tl.to(piece.userData.haloMat, { opacity: 0, duration: 0.1 });
      
      // Propel downward
      tl.to(piece.position, { y: -2, duration: 0.6, ease: "power2.in" }, 0);
      
      // Scale down
      tl.to(piece.scale, { x: 0, y: 0, z: 0, duration: 0.6, ease: "power2.inOut" }, 0);
      
      // Opacity fade to 0 (Wireframe)
      const materials = [];
      piece.traverse(c => {
        if (c.material && c.type === 'LineSegments') materials.push(c.material);
      });
      
      if (materials.length > 0) {
        tl.to(materials, { opacity: 0, duration: 0.5, ease: "none" }, 0.1);
      }
      
      tl.call(() => {
         piecesContainer.remove(piece);
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
