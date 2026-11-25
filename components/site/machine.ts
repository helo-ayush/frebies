import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export const CORAL = 0xf2552c;
const INK = 0x1b1b1e;

type Disposable = { dispose: () => void };

export type Machine = {
  group: THREE.Group;
  /** 0 = button out, 1 = fully pressed. */
  press: (amount: number) => void;
  /** 0 = button at rest, 1 = lit. */
  glow: (amount: number) => void;
  /** Two short strings on the readout, drawn as FROM → TO. */
  display: (from: string, to: string) => void;
  disposables: Disposable[];
};

/** Canvas-ready font family for the landing's wide face (next/font hashes the name). */
export function wideFamily(): string {
  if (typeof window === "undefined") return "sans-serif";
  const host = document.querySelector("body") ?? document.body;
  return getComputedStyle(host).getPropertyValue("--font-wide").trim() || "sans-serif";
}

export async function wideReady() {
  try {
    await document.fonts.load(`700 expanded 64px ${wideFamily()}`);
  } catch {
    // The fallback face is fine if the font never arrives.
  }
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d") as CanvasRenderingContext2D };
}

/** Fine speckle used as a bump map, so plastics read as moulded rather than CG-smooth. */
function grainTexture() {
  const { canvas, ctx } = canvas2d(256, 256);
  const image = ctx.createImageData(256, 256);
  for (let index = 0; index < image.data.length; index += 4) {
    const value = 118 + Math.random() * 24;
    image.data[index] = image.data[index + 1] = image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

function decal(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const { canvas, ctx } = canvas2d(width, height);
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Studio light rig shared by both scenes. */
export function lightScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Disposable[] {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.42;

  const key = new THREE.DirectionalLight(0xfff4e6, 2.35);
  key.position.set(-4.5, 7, 7.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.radius = 5;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffe4d8, 0.75);
  rim.position.set(7, 2, -3);
  scene.add(rim);

  return [environment, pmrem, key.shadow.map ?? { dispose() {} }];
}

export function makeRenderer(mount: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
  mount.appendChild(renderer.domElement);
  return renderer;
}

export function buildMachine(): Machine {
  const group = new THREE.Group();
  const disposables: Disposable[] = [];
  const keep = <T extends Disposable>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const family = wideFamily();

  const grain = keep(grainTexture());
  const bone = keep(
    new THREE.MeshPhysicalMaterial({
      color: 0xe9e4d9,
      roughness: 0.62,
      clearcoat: 0.18,
      clearcoatRoughness: 0.6,
      bumpMap: grain,
      bumpScale: 0.35,
    }),
  );
  const ink = keep(
    new THREE.MeshPhysicalMaterial({ color: INK, roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.22 }),
  );
  const inkMatte = keep(new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.8 }));
  const coral = keep(
    new THREE.MeshPhysicalMaterial({ color: CORAL, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  );
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xc9c9cb, roughness: 0.2, metalness: 1 }));
  const steelDark = keep(new THREE.MeshStandardMaterial({ color: 0x77777b, roughness: 0.32, metalness: 1 }));

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = group) => {
    keep(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  /* Housing: lid and base around a coral core that shows as the seam. */
  const lid = add(new RoundedBoxGeometry(3.5, 2.22, 2.7, 10, 0.36), bone);
  lid.position.y = 0.43;
  const base = add(new RoundedBoxGeometry(3.5, 1.0, 2.7, 10, 0.3), bone);
  base.position.y = -1.16;
  const core = add(new RoundedBoxGeometry(3.4, 0.7, 2.6, 6, 0.28), coral);
  core.position.y = -0.64;

  /* Faceplate: the brand mark as hardware. */
  const plate = new THREE.Group();
  plate.position.set(-0.6, 0.46, 1.35);
  group.add(plate);
  add(new RoundedBoxGeometry(1.66, 1.66, 0.2, 8, 0.1), ink, plate).position.z = 0.02;

  const bezel = add(new THREE.TorusGeometry(0.54, 0.065, 24, 80), steel, plate);
  bezel.position.z = 0.13;
  const well = add(new THREE.CylinderGeometry(0.52, 0.52, 0.06, 64), inkMatte, plate);
  well.rotation.x = Math.PI / 2;
  well.position.z = 0.105;

  const buttonMaterial = keep(
    new THREE.MeshPhysicalMaterial({
      color: CORAL,
      emissive: CORAL,
      emissiveIntensity: 0.06,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    }),
  );
  const button = new THREE.Group();
  button.position.z = 0.12;
  plate.add(button);
  const stem = add(new THREE.CylinderGeometry(0.455, 0.455, 0.22, 64), buttonMaterial, button);
  stem.rotation.x = Math.PI / 2;
  stem.position.z = 0.06;
  const dome = add(new THREE.SphereGeometry(0.455, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), buttonMaterial, button);
  dome.rotation.x = Math.PI / 2;
  dome.scale.y = 0.5;
  dome.position.z = 0.17;

  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const screw = add(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 24), steelDark, plate);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x * 0.69, y * 0.69, 0.125);
    const slot = add(new THREE.BoxGeometry(0.085, 0.015, 0.012), inkMatte, plate);
    slot.position.set(x * 0.69, y * 0.69, 0.152);
    slot.rotation.z = x * y * 0.7;
  }

  /* Readout. */
  const screen = canvas2d(512, 300);
  const screenTexture = keep(new THREE.CanvasTexture(screen.canvas));
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 8;
  const readout = new THREE.Group();
  readout.position.set(0.92, 0.95, 1.36);
  group.add(readout);
  add(new RoundedBoxGeometry(1.02, 0.64, 0.12, 6, 0.06), ink, readout);
  const glassGeometry = keep(new THREE.PlaneGeometry(0.9, 0.527));
  const glassMaterial = keep(new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }));
  const glass = new THREE.Mesh(glassGeometry, glassMaterial);
  glass.position.z = 0.064;
  readout.add(glass);

  function display(from: string, to: string) {
    const { ctx } = screen;
    ctx.fillStyle = "#151517";
    ctx.fillRect(0, 0, 512, 300);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `600 expanded 62px ${family}`;
    ctx.fillStyle = "#8f8e93";
    ctx.fillText(from, 34, 88);
    // Long words shrink to stay on the glass.
    let size = 92;
    ctx.font = `800 expanded ${size}px ${family}`;
    while (size > 40 && ctx.measureText(to).width > 446) {
      size -= 4;
      ctx.font = `800 expanded ${size}px ${family}`;
    }
    ctx.fillStyle = "#ff7a55";
    ctx.fillText(to, 34, 206);
    ctx.fillStyle = "#ff7a55";
    ctx.beginPath();
    ctx.moveTo(420, 70);
    ctx.lineTo(474, 70);
    ctx.lineTo(447, 110);
    ctx.closePath();
    ctx.fill();
    screenTexture.needsUpdate = true;
  }
  display("ANY", "FILE");

  /* Speaker slots and two small caps under the readout. */
  for (let index = 0; index < 5; index += 1) {
    const vent = add(new RoundedBoxGeometry(0.86, 0.05, 0.06, 3, 0.024), inkMatte);
    vent.position.set(0.92, 0.42 - index * 0.115, 1.34);
  }
  const capA = add(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 32), ink);
  capA.rotation.x = Math.PI / 2;
  capA.position.set(0.62, -0.28, 1.36);
  const capB = add(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 32), coral);
  capB.rotation.x = Math.PI / 2;
  capB.position.set(0.92, -0.28, 1.36);
  const lamp = add(new THREE.SphereGeometry(0.045, 20, 20), buttonMaterial);
  lamp.position.set(1.25, -0.28, 1.36);

  /* Side slots the files travel through. */
  for (const side of [-1, 1]) {
    const frame = add(new RoundedBoxGeometry(0.16, 1.62, 0.62, 5, 0.07), ink);
    frame.position.set(side * 1.75, 0.42, 0);
    const lip = add(new RoundedBoxGeometry(0.2, 1.4, 0.34, 4, 0.06), coral);
    lip.position.set(side * 1.75, 0.42, 0);
    const mouth = add(new THREE.BoxGeometry(0.22, 1.26, 0.16), inkMatte);
    mouth.position.set(side * 1.75, 0.42, 0);
    for (let index = 0; index < 4; index += 1) {
      const fin = add(new RoundedBoxGeometry(0.08, 0.05, 1.5, 3, 0.02), inkMatte);
      fin.position.set(side * 1.745, -1.32 + index * 0.1, 0);
    }
  }

  /* Handle. */
  const curve = new THREE.CatmullRomCurve3(
    [
      [-1.12, 1.4, 0], [-1.12, 1.74, 0], [-1.02, 2.02, 0], [-0.74, 2.12, 0], [0, 2.13, 0],
      [0.74, 2.12, 0], [1.02, 2.02, 0], [1.12, 1.74, 0], [1.12, 1.4, 0],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  add(new THREE.TubeGeometry(curve, 96, 0.09, 20), steel);
  const grip = add(new THREE.CylinderGeometry(0.15, 0.15, 1.1, 36), inkMatte);
  grip.rotation.z = Math.PI / 2;
  grip.position.y = 2.13;
  for (const side of [-1, 1]) {
    const collar = add(new THREE.CylinderGeometry(0.19, 0.22, 0.14, 36), ink);
    collar.position.set(side * 1.12, 1.58, 0);
  }

  /* Feet and decals. */
  for (const [x, z] of [[-1.2, -0.85], [1.2, -0.85], [-1.2, 0.85], [1.2, 0.85]] as const) {
    const foot = add(new THREE.CylinderGeometry(0.2, 0.17, 0.16, 32), inkMatte);
    foot.position.set(x, -1.66, z);
  }
  const badge = keep(
    decal(1024, 200, (ctx) => {
      ctx.fillStyle = "#2b2a2d";
      ctx.textBaseline = "middle";
      ctx.font = `700 expanded 104px ${family}`;
      ctx.fillText("frebies", 8, 104);
      ctx.save();
      ctx.beginPath();
      ctx.rect(690, 52, 326, 96);
      ctx.clip();
      for (let index = 0; index < 8; index += 1) {
        ctx.fillStyle = index < 5 ? "#f2552c" : "#2b2a2d";
        ctx.beginPath();
        const x = 660 + index * 46;
        ctx.moveTo(x + 70, 52);
        ctx.lineTo(x + 94, 52);
        ctx.lineTo(x + 24, 148);
        ctx.lineTo(x, 148);
        ctx.fill();
      }
      ctx.restore();
    }),
  );
  const badgeGeometry = keep(new THREE.PlaneGeometry(2.7, 0.527));
  const badgeMaterial = keep(new THREE.MeshStandardMaterial({ map: badge, transparent: true, roughness: 0.8 }));
  const badgeMesh = new THREE.Mesh(badgeGeometry, badgeMaterial);
  badgeMesh.position.set(0, -1.17, 1.353);
  group.add(badgeMesh);

  return {
    group,
    press: (amount) => {
      button.position.z = 0.12 - amount * 0.15;
    },
    glow: (amount) => {
      buttonMaterial.emissiveIntensity = 0.06 + amount * 0.55;
    },
    display,
    disposables,
  };
}

/* ---------- File cards ---------- */

export type CardArt = "image" | "doc" | "audio";

function paintCard(ext: string, color: string, art: CardArt, tidy: boolean) {
  return decal(384, 480, (ctx) => {
    ctx.clearRect(0, 0, 384, 480);
    const tone = tidy ? color : "#a9a8a4";
    if (art === "image") {
      ctx.fillStyle = tidy ? "#fbe3d6" : "#e4e3df";
      ctx.fillRect(34, 92, 316, 214);
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(34, 306);
      ctx.lineTo(140, 168);
      ctx.lineTo(214, 262);
      ctx.lineTo(262, 206);
      ctx.lineTo(350, 306);
      ctx.fill();
      ctx.fillRect(266, 124, 46, 46);
    } else if (art === "doc") {
      ctx.fillStyle = tone;
      ctx.fillRect(34, 92, 170, 26);
      ctx.fillStyle = tidy ? "#d8d7d2" : "#d9d8d4";
      [316, 270, 300, 214, 288].forEach((width, index) => ctx.fillRect(34, 148 + index * 34, width, 14));
    } else {
      ctx.fillStyle = tone;
      for (let index = 0; index < 18; index += 1) {
        const height = 30 + Math.abs(Math.sin(index * 1.21)) * 160;
        ctx.fillRect(34 + index * 17.8, 200 - height / 2, 9, height);
      }
    }
    ctx.fillStyle = tidy ? color : "#1d1c1f";
    ctx.font = `800 expanded 62px ${wideFamily()}`;
    const width = ctx.measureText(ext).width + 46;
    ctx.fillRect(34, 352, width, 92);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(ext, 57, 400);
  });
}

/** A dog-eared file, 1.04 × 1.3 units, facing +z. */
export function buildCard(ext: string, color: string, art: CardArt, tidy: boolean): { group: THREE.Group; disposables: Disposable[] } {
  const group = new THREE.Group();
  const W = 1.04;
  const H = 1.3;
  const E = 0.24;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -H / 2);
  shape.lineTo(W / 2, -H / 2);
  shape.lineTo(W / 2, H / 2 - E);
  shape.lineTo(W / 2 - E, H / 2);
  shape.lineTo(-W / 2, H / 2);
  shape.closePath();

  const body = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
  });
  body.translate(0, 0, -0.025);
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: 0xfbfaf7, roughness: 0.5, clearcoat: 0.4 });
  const mesh = new THREE.Mesh(body, bodyMaterial);
  mesh.castShadow = true;
  group.add(mesh);

  const fold = new THREE.Shape();
  fold.moveTo(W / 2 - E, H / 2);
  fold.lineTo(W / 2, H / 2 - E);
  fold.lineTo(W / 2 - E, H / 2 - E);
  fold.closePath();
  const foldGeometry = new THREE.ShapeGeometry(fold);
  const foldMaterial = new THREE.MeshStandardMaterial({ color: tidy ? new THREE.Color(color) : 0xcfceca, roughness: 0.7 });
  const foldMesh = new THREE.Mesh(foldGeometry, foldMaterial);
  foldMesh.position.z = 0.041;
  group.add(foldMesh);

  const texture = paintCard(ext, color, art, tidy);
  const faceGeometry = new THREE.PlaneGeometry(W, H);
  const faceMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  face.position.z = 0.0395;
  group.add(face);

  return { group, disposables: [body, bodyMaterial, foldGeometry, foldMaterial, texture, faceGeometry, faceMaterial] };
}
