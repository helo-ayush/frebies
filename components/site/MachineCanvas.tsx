"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  buildCard,
  buildMachine,
  lightScene,
  makeRenderer,
  wideReady,
  type CardArt,
} from "./machine";

type Job = { from: string; to: string; art: CardArt; color: string };

/** Conversions the free tools really do; the machine runs through them on a loop. */
const JOBS: Job[] = [
  { from: "HEIC", to: "JPG", art: "image", color: "#f2552c" },
  { from: "PDF", to: "PNG", art: "doc", color: "#f2552c" },
  { from: "WAV", to: "MP3", art: "audio", color: "#f2552c" },
  { from: "PNG", to: "WEBP", art: "image", color: "#f2552c" },
  { from: "JPG", to: "PDF", art: "doc", color: "#f2552c" },
];

const BEAT = 2.5; // seconds between files
const LOOP = BEAT * JOBS.length;
const SPEED = 1.15;

/**
 * Hero scene. Loose files ride in from the left, go through the machine, and
 * come out converted on the right. `progressRef` turns it as the page scrolls.
 */
export function MachineHero({
  progressRef,
  className = "",
}: {
  progressRef: { current: number };
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      await wideReady();
      if (disposed) return;

      let renderer: THREE.WebGLRenderer;
      try {
        renderer = makeRenderer(mount);
      } catch {
        setFailed(true);
        return;
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const scene = new THREE.Scene();
      const lights = lightScene(scene, renderer);
      const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
      const machine = buildMachine();
      const rig = new THREE.Group();
      rig.add(machine.group);
      scene.add(rig);

      const disposables = [...lights, ...machine.disposables];
      const inputs: THREE.Group[] = [];
      const outputs: THREE.Group[] = [];
      JOBS.forEach((job) => {
        const raw = buildCard(job.from, "#1d1c1f", job.art, false);
        const done = buildCard(job.to, job.color, job.art, true);
        rig.add(raw.group, done.group);
        inputs.push(raw.group);
        outputs.push(done.group);
        disposables.push(...raw.disposables, ...done.disposables);
      });

      function resize() {
        if (!mount) return;
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        const portrait = width / height < 0.9;
        // Frame the machine by height on desktop and by width on phones.
        camera.position.set(0, 1.9, portrait ? 25 : 18.6);
        camera.lookAt(0, portrait ? 0.95 : 0.8, 0);
        rig.position.x = portrait ? 0 : -0.95;
        rig.scale.setScalar(portrait ? 0.92 : 0.87);
        camera.updateProjectionMatrix();
      }
      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);

      const pointer = { x: 0, y: 0 };
      const eased = { x: 0, y: 0, p: 0, press: 0 };
      const onPointer = (event: PointerEvent) => {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      let shownJob = -1;
      const started = performance.now();

      function render(now: number) {
        const time = reduce ? BEAT * 0.4 : (now - started) / 1000 + BEAT * 0.2;
        eased.x += (pointer.x - eased.x) * 0.045;
        eased.y += (pointer.y - eased.y) * 0.045;
        eased.p += (progressRef.current - eased.p) * 0.12;

        rig.rotation.y = -0.46 + eased.x * 0.1 - eased.p * 0.5;
        rig.rotation.x = 0.02 + eased.y * 0.05;
        rig.position.y = Math.sin(time * 0.8) * 0.035;

        let job = 0;
        let best = Infinity;
        for (let index = 0; index < JOBS.length; index += 1) {
          // 0 is the moment file `index` reaches the slot.
          const phase = (((time - index * BEAT) % LOOP) + LOOP) % LOOP;
          if (phase < best) {
            best = phase;
            job = index;
          }

          const raw = inputs[index];
          const until = LOOP - phase;
          const inX = -0.9 - SPEED * until;
          raw.visible = inX > -11 && phase > LOOP - 9;
          if (raw.visible) {
            const settle = THREE.MathUtils.smoothstep(inX, -5.2, -2.1);
            const loose = 1 - settle;
            raw.position.set(
              inX,
              0.42 + loose * Math.sin(time * 1.1 + index * 2) * 0.34,
              loose * Math.cos(time * 0.8 + index) * 0.4,
            );
            raw.rotation.set(
              loose * Math.sin(time * 0.9 + index * 1.4) * 0.26,
              loose * (0.35 + Math.sin(time * 0.7 + index) * 0.3),
              loose * Math.sin(time * 0.8 + index * 3) * 0.36,
            );
            raw.scale.setScalar(0.94);
          }

          const done = outputs[index];
          const outX = 0.6 + SPEED * (phase - 0.5);
          done.visible = phase > 0.5 && outX < 9.5;
          if (done.visible) {
            // Rise a little so the perspective keeps files inside the band, and tuck
            // them away before the canvas edge once the page starts to travel.
            const tuck = THREE.MathUtils.smoothstep(eased.p, 0.005, 0.06) * THREE.MathUtils.smoothstep(outX, 3.6, 4.9);
            done.position.set(outX, 0.42 + Math.max(0, outX - 1.6) * 0.16, 0);
            done.rotation.set(0, 0, 0);
            done.scale.setScalar(Math.max(0.001, 0.86 * (1 - tuck)));
          }
        }

        if (job !== shownJob) {
          shownJob = job;
          machine.display(JOBS[job].from, JOBS[job].to);
        }
        const pulse = best < 0.7 ? Math.sin((best / 0.7) * Math.PI) : 0;
        eased.press += (pulse - eased.press) * 0.35;
        machine.press(eased.press);
        machine.glow(eased.press);

        renderer.render(scene, camera);
      }

      let frame = 0;
      let visible = true;
      const loop = (now: number) => {
        frame = window.requestAnimationFrame(loop);
        if (visible) render(now);
      };
      const visibility = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      });
      visibility.observe(mount);
      if (reduce) render(started);
      else loop(started);

      cleanup = () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", onPointer);
        resizeObserver.disconnect();
        visibility.disconnect();
        disposables.forEach((item) => item.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [progressRef]);

  if (failed) return <FlatMachine className={className} />;
  return <div ref={mountRef} className={className} aria-hidden />;
}

/** Closing scene: the machine head-on. `pressed` pushes the button and lights it. */
export function MachineFront({
  pressed,
  from = "READY",
  to = "GO",
  className = "",
}: {
  pressed: boolean;
  /** The two lines on its display. */
  from?: string;
  to?: string;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pressedRef = useRef(pressed);
  pressedRef.current = pressed;
  const lines = useRef({ from, to });
  lines.current = { from, to };
  const displayRef = useRef<((from: string, to: string) => void) | null>(null);
  useEffect(() => displayRef.current?.(from, to), [from, to]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      await wideReady();
      if (disposed) return;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = makeRenderer(mount);
      } catch {
        setFailed(true);
        return;
      }
      const scene = new THREE.Scene();
      const lights = lightScene(scene, renderer);
      const camera = new THREE.PerspectiveCamera(18, 1, 0.1, 100);
      const machine = buildMachine();
      machine.display(lines.current.from, lines.current.to);
      displayRef.current = machine.display;
      scene.add(machine.group);
      const disposables = [...lights, ...machine.disposables];

      function resize() {
        if (!mount) return;
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        // Cropped at the base on purpose: it stands on the bottom edge of the page.
        const narrow = width / height < 0.95;
        camera.position.set(0, 0.9, narrow ? 15.5 : 12.9);
        camera.lookAt(0, narrow ? 0.5 : 0.62, 0);
        camera.updateProjectionMatrix();
      }
      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);

      const pointer = { x: 0, y: 0 };
      const eased = { x: 0, y: 0, on: 0 };
      const onPointer = (event: PointerEvent) => {
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      // Compile shaders now, so reaching the end of the page does not stutter.
      renderer.render(scene, camera);

      let frame = 0;
      let visible = false;
      const loop = () => {
        frame = window.requestAnimationFrame(loop);
        if (!visible) return;
        eased.x += (pointer.x - eased.x) * 0.05;
        eased.y += (pointer.y - eased.y) * 0.05;
        eased.on += ((pressedRef.current ? 1 : 0) - eased.on) * 0.1;
        machine.group.rotation.set(eased.y * 0.05, eased.x * 0.14, 0);
        machine.press(eased.on * 0.75);
        machine.glow(eased.on);
        renderer.render(scene, camera);
      };
      const visibility = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      });
      visibility.observe(mount);
      loop();

      cleanup = () => {
        displayRef.current = null;
        window.cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", onPointer);
        resizeObserver.disconnect();
        visibility.disconnect();
        disposables.forEach((item) => item.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  if (failed) return <FlatMachine className={className} />;
  return <div ref={mountRef} className={className} aria-hidden />;
}

/** No WebGL: the same object as flat shapes. */
function FlatMachine({ className = "" }: { className?: string }) {
  return (
    <div className={`grid place-items-center ${className}`} aria-hidden>
      <div className="w-[min(46vw,320px)] border-[10px] border-[#e6e1d6] bg-[#e6e1d6]">
        <div className="grid aspect-square place-items-center bg-[var(--fb-ink)]">
          <span className="h-1/3 w-1/3 rounded-full bg-[var(--fb-coral)]" />
        </div>
        <div className="mt-2 h-2 bg-[var(--fb-coral)]" />
        <div className="h-14" />
      </div>
    </div>
  );
}
