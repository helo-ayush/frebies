"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type FileKind = { ext: string; color: string; art: "image" | "doc" | "audio" | "video" };

const FILES: FileKind[] = [
  { ext: "JPG", color: "#e55e40", art: "image" },
  { ext: "PDF", color: "#d0453f", art: "doc" },
  { ext: "MP3", color: "#7a5cd6", art: "audio" },
  { ext: "PNG", color: "#e89a1c", art: "image" },
  { ext: "MP4", color: "#22222a", art: "video" },
  { ext: "WEBP", color: "#1f9d8b", art: "image" },
  { ext: "WAV", color: "#3b7fd9", art: "audio" },
  { ext: "DOC", color: "#2f6fb5", art: "doc" },
  { ext: "SVG", color: "#2f9e5a", art: "image" },
];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Paints the face of a file tile: an extension badge and a hint of its content. */
function paintFace(kind: FileKind): HTMLCanvasElement {
  const W = 512;
  const H = 648;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.clearRect(0, 0, W, H);

  // Content preview
  const px = 56;
  const py = 60;
  const pw = W - px * 2;
  const ph = 300;
  roundRect(ctx, px, py, pw, ph, 30);
  ctx.save();
  ctx.clip();
  if (kind.art === "image") {
    const sky = ctx.createLinearGradient(0, py, 0, py + ph);
    sky.addColorStop(0, "#fde3c4");
    sky.addColorStop(1, "#f6b78d");
    ctx.fillStyle = sky;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = "#fff4dd";
    ctx.beginPath();
    ctx.arc(px + pw * 0.72, py + ph * 0.34, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = kind.color;
    ctx.beginPath();
    ctx.moveTo(px - 10, py + ph);
    ctx.lineTo(px + pw * 0.34, py + ph * 0.42);
    ctx.lineTo(px + pw * 0.6, py + ph * 0.78);
    ctx.lineTo(px + pw * 0.78, py + ph * 0.58);
    ctx.lineTo(px + pw + 10, py + ph);
    ctx.closePath();
    ctx.fill();
  } else if (kind.art === "doc") {
    ctx.fillStyle = "#f4f1ea";
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = kind.color;
    roundRect(ctx, px + 34, py + 36, pw * 0.5, 22, 11);
    ctx.fill();
    ctx.fillStyle = "#cfc9bc";
    [0.86, 0.72, 0.8, 0.58, 0.76, 0.44].forEach((width, index) => {
      roundRect(ctx, px + 34, py + 86 + index * 34, (pw - 68) * width, 14, 7);
      ctx.fill();
    });
  } else if (kind.art === "audio") {
    ctx.fillStyle = "#f1eefb";
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = kind.color;
    const bars = 15;
    const gap = (pw - 60) / bars;
    for (let index = 0; index < bars; index += 1) {
      const height = 40 + Math.abs(Math.sin(index * 1.31 + kind.ext.length) * 170);
      roundRect(ctx, px + 30 + index * gap, py + ph / 2 - height / 2, gap * 0.56, height, gap * 0.28);
      ctx.fill();
    }
  } else {
    const dusk = ctx.createLinearGradient(px, py, px + pw, py + ph);
    dusk.addColorStop(0, "#3a3a46");
    dusk.addColorStop(1, "#16161b");
    ctx.fillStyle = dusk;
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px + pw / 2, py + ph / 2, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e55e40";
    ctx.beginPath();
    ctx.moveTo(px + pw / 2 - 18, py + ph / 2 - 28);
    ctx.lineTo(px + pw / 2 + 30, py + ph / 2);
    ctx.lineTo(px + pw / 2 - 18, py + ph / 2 + 28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Extension badge
  ctx.font = "700 76px Inter, system-ui, sans-serif";
  const label = kind.ext;
  const textWidth = ctx.measureText(label).width;
  const bw = textWidth + 68;
  const bh = 118;
  const bx = px;
  const by = py + ph + 46;
  ctx.fillStyle = kind.color;
  roundRect(ctx, bx, by, bw, bh, 34);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + 34, by + bh / 2 + 4);

  // Meta lines
  ctx.fillStyle = "#d9d4c8";
  roundRect(ctx, px, by + bh + 34, pw * 0.62, 16, 8);
  ctx.fill();
  roundRect(ctx, px, by + bh + 66, pw * 0.4, 16, 8);
  ctx.fill();

  return canvas;
}

type Tile = {
  group: THREE.Group;
  scatter: THREE.Vector3;
  phase: number;
  speed: number;
  tilt: THREE.Euler;
  orbit: number;
};

/**
 * The hero's 3D piece: file tiles drifting around the frebies cube. They follow
 * the pointer, and as the page scrolls (`progress` 0 → 1) they are pulled into
 * the cube, which is the product in one image: loose files in, tidy files out.
 */
export function HeroScene({
  progressRef,
  className = "",
}: {
  /** Scroll progress through the hero, 0 at the top to 1 when it has left. */
  progressRef: { current: number };
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setFailed(true);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environment = environment;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.2, 15);

    const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
    key.position.set(5, 8, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff7a4d, 1.4);
    rim.position.set(-7, -2, -4);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);

    const disposables: { dispose: () => void }[] = [environment, pmrem];

    // --- The cube: the brand mark as an object ---
    const cube = new THREE.Group();
    const cubeGeometry = new RoundedBoxGeometry(2.5, 2.5, 2.5, 8, 0.62);
    const cubeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x101013,
      roughness: 0.22,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.25,
    });
    cube.add(new THREE.Mesh(cubeGeometry, cubeMaterial));

    const dotGeometry = new THREE.SphereGeometry(0.46, 48, 48);
    const dotMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xe9623f,
      emissive: 0xe9623f,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      clearcoat: 1,
    });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(0, 0, 1.18);
    cube.add(dot);

    const ringGeometry = new THREE.TorusGeometry(2.55, 0.018, 12, 140);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xe55e40, transparent: true, opacity: 0.55 });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.set(Math.PI / 2.35, 0.25, 0);
    world.add(ring);
    const ring2Material = new THREE.MeshBasicMaterial({ color: 0x0f0f10, transparent: true, opacity: 0.16 });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.012, 12, 160), ring2Material);
    ring2.rotation.set(Math.PI / 2.1, -0.4, 0);
    world.add(ring2);

    world.add(cube);
    disposables.push(cubeGeometry, cubeMaterial, dotGeometry, dotMaterial, ringGeometry, ringMaterial, ring2.geometry, ring2Material);

    // --- File tiles ---
    const tileGeometry = new RoundedBoxGeometry(1.5, 1.9, 0.14, 6, 0.13);
    const faceGeometry = new THREE.PlaneGeometry(1.5, 1.9);
    disposables.push(tileGeometry, faceGeometry);

    const tiles: Tile[] = FILES.map((kind, index) => {
      const group = new THREE.Group();
      const bodyMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xfffdf9,
        roughness: 0.38,
        clearcoat: 0.9,
        clearcoatRoughness: 0.25,
        envMapIntensity: 0.9,
      });
      group.add(new THREE.Mesh(tileGeometry, bodyMaterial));

      const texture = new THREE.CanvasTexture(paintFace(kind));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const faceMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
      const face = new THREE.Mesh(faceGeometry, faceMaterial);
      face.position.z = 0.072;
      group.add(face);
      // The same face on the back, so a tile never shows a blank side as it turns.
      const back = new THREE.Mesh(faceGeometry, faceMaterial);
      back.position.z = -0.072;
      back.rotation.y = Math.PI;
      group.add(back);
      disposables.push(bodyMaterial, texture, faceMaterial);

      const angle = (index / FILES.length) * Math.PI * 2 + 0.35;
      const radiusX = 4.3 + (index % 3) * 0.55;
      const radiusY = 2.15 + ((index * 7) % 4) * 0.28;
      const scatter = new THREE.Vector3(
        Math.cos(angle) * radiusX,
        Math.sin(angle) * radiusY,
        Math.sin(angle * 2 + index) * 1.6 - 0.4,
      );
      group.position.copy(scatter);
      world.add(group);

      return {
        group,
        scatter,
        phase: index * 1.7,
        speed: 0.55 + (index % 4) * 0.12,
        tilt: new THREE.Euler(
          Math.sin(index * 2.1) * 0.32,
          Math.cos(index * 1.3) * 0.55,
          Math.sin(index * 0.9) * 0.2,
        ),
        orbit: angle,
      };
    });

    // --- Sizing ---
    function resize() {
      if (!mount) return;
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Keep the whole composition in frame on narrow canvases.
      camera.position.z = width / height < 1 ? 21 : width / height < 1.35 ? 17.5 : 15;
      camera.updateProjectionMatrix();
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    // --- Pointer ---
    const pointer = { x: 0, y: 0 };
    const eased = { x: 0, y: 0, p: 0 };
    function onPointerMove(event: PointerEvent) {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    // --- Loop ---
    const clock = new THREE.Clock();
    let frame = 0;
    let visible = true;
    const target = new THREE.Vector3();

    function render() {
      const time = clock.getElapsedTime();
      const progress = Math.min(1, Math.max(0, progressRef.current));
      eased.p += (progress - eased.p) * 0.08;
      eased.x += (pointer.x - eased.x) * 0.05;
      eased.y += (pointer.y - eased.y) * 0.05;

      // Pull is the scroll-driven part: 0 = loose files, 1 = swallowed by the cube.
      const pull = THREE.MathUtils.smoothstep(eased.p, 0.05, 0.85);

      world.rotation.y = eased.x * 0.32 + Math.sin(time * 0.16) * 0.22 + pull * 0.9;
      world.rotation.x = eased.y * 0.16 - pull * 0.12;
      world.position.y = pull * 0.9;

      cube.rotation.y = -0.42 + Math.sin(time * 0.35) * 0.14 + pull * 1.2;
      cube.rotation.x = 0.2 + Math.cos(time * 0.3) * 0.07;
      cube.position.y = Math.sin(time * 0.7) * 0.1;
      const cubeScale = 1 + pull * 0.22;
      cube.scale.setScalar(cubeScale);
      dotMaterial.emissiveIntensity = 0.5 + Math.sin(time * 2) * 0.12 + pull * 0.9;

      ring.rotation.z = time * 0.12;
      ring2.rotation.z = -time * 0.07;
      ringMaterial.opacity = 0.55 * (1 - pull * 0.6);

      tiles.forEach((tile, index) => {
        const local = THREE.MathUtils.clamp(pull * 1.35 - index * 0.04, 0, 1);
        const drift = time * 0.09 * tile.speed;
        const cos = Math.cos(drift);
        const sin = Math.sin(drift);
        target.set(
          tile.scatter.x * cos - tile.scatter.z * sin,
          tile.scatter.y + Math.sin(time * tile.speed + tile.phase) * 0.22,
          tile.scatter.x * sin + tile.scatter.z * cos,
        );
        // Spiral inwards rather than travelling in a straight line.
        const swirl = local * 2.4;
        const sx = target.x * Math.cos(swirl) - target.z * Math.sin(swirl);
        const sz = target.x * Math.sin(swirl) + target.z * Math.cos(swirl);
        const keep = 1 - local;
        tile.group.position.set(sx * keep, target.y * keep, sz * keep);
        tile.group.scale.setScalar(Math.max(0.001, 1 - local * 0.92));
        tile.group.rotation.set(
          tile.tilt.x + Math.sin(time * 0.5 + tile.phase) * 0.12 + local * 2.2,
          tile.tilt.y + Math.cos(time * 0.4 + tile.phase) * 0.18 - world.rotation.y * 0.75 + local * 3.1,
          tile.tilt.z + local * 1.4,
        );
      });

      renderer.render(scene, camera);
    }

    function loop() {
      frame = window.requestAnimationFrame(loop);
      if (visible) render();
    }

    const visibility = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      },
      { rootMargin: "120px" },
    );
    visibility.observe(mount);

    if (reduceMotion) {
      render();
    } else {
      loop();
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      resizeObserver.disconnect();
      visibility.disconnect();
      disposables.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [progressRef]);

  if (failed) {
    // No WebGL: a flat version of the same idea.
    return (
      <div className={`grid place-items-center ${className}`} aria-hidden>
        <div className="relative h-56 w-56">
          <div className="absolute inset-8 grid place-items-center rounded-[44px] bg-ink shadow-[0_40px_80px_-30px_rgba(15,15,16,0.6)]">
            <span className="h-12 w-12 rounded-full bg-accent" />
          </div>
          {FILES.slice(0, 6).map((file, index) => (
            <span
              key={file.ext}
              className="absolute rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-white shadow-pop"
              style={{
                background: file.color,
                left: `${50 + Math.cos((index / 6) * Math.PI * 2) * 52}%`,
                top: `${50 + Math.sin((index / 6) * Math.PI * 2) * 52}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {file.ext}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className={className} aria-hidden />;
}
