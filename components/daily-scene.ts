/**
 * 第一層 每日棋盤 in 3D: the 28 squares as floating islands in a diamond ring, each labelled in
 * words, and you as a little spaceship hopping round. Same floating look and camera as the public
 * table: drag to turn and tilt, pinch to zoom, a gentle sway when left alone.
 */
import { BOARD_SIZE, TILES, type TileKind } from "@/lib/board";

export type DailyScene = {
  /** Fly the ship to a square (one square at a time as the walk plays). */
  moveTo(index: number): void;
  /** Glow the square the ship stopped on (null: none). */
  highlight(index: number | null): void;
  /** Words floating up from the ship, e.g. "+2 金幣". */
  floatText(text: string, colour?: string): void;
  /** Put the camera back over the whole board. */
  recentre(): void;
  dispose(): void;
};

const SIDE = BOARD_SIZE / 4; // 7 steps between corners
const PITCH = 1.45;
const R = (SIDE * PITCH) / Math.SQRT2;
const TOP = 0.34;
/** Island top colour for each kind of square. */
const TOPS: Record<TileKind, number> = {
  start: 0xfbd000,
  coin: 0x62b843,
  chest: 0xf59e0b,
  lucky: 0x38bdf8,
  attack: 0xe52521,
  jail: 0x64748b,
  tax: 0x8b5cf6,
};

/** Square i on the diamond: start at the front corner, then round the left, back and right corners. */
function squarePoint(i: number): [number, number] {
  const corners: [number, number][] = [[0, R], [-R, 0], [0, -R], [R, 0]];
  const side = Math.floor(i / SIDE), k = i % SIDE;
  const [ax, az] = corners[side], [bx, bz] = corners[(side + 1) % 4];
  return [ax + ((bx - ax) * k) / SIDE, az + ((bz - az) * k) / SIDE];
}

export function createDailyScene(T: any, container: HTMLElement, labels: string[], start: number): DailyScene {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const sky = document.createElement("canvas");
  sky.width = 4;
  sky.height = 256;
  const sg = sky.getContext("2d")!;
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#3d6fb0");
  grad.addColorStop(0.55, "#1d3560");
  grad.addColorStop(1, "#0b1428");
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new T.CanvasTexture(sky);
  skyTex.encoding = T.sRGBEncoding;
  scene.background = skyTex;
  scene.fog = new T.Fog(0x12203d, 40, 120);

  const camera = new T.PerspectiveCamera(38, 1, 0.1, 300);
  scene.add(new T.HemisphereLight(0xdfe9ff, 0x101a2e, 0.75));
  const sun = new T.DirectionalLight(0xfff0d0, 1.3);
  sun.position.set(-8, 20, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
  scene.add(sun);

  const mat = (color: number, rough = 0.6, extra: object = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: rough }, extra));
  const shadowy = (m: any) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const soft = (inner: string, outer: string) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  };
  const shadowTex = soft("rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
  const glowTex = soft("rgba(170,210,255,0.9)", "rgba(170,210,255,0)");
  const FLOOR = -2.6;

  function islandMesh(size: number, seed: number, top: number) {
    const g = new T.Group();
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
    const rough = (geo: any, amt: number) => {
      const p = geo.attributes.position, seen = new Map<string, number[]>();
      for (let i = 0; i < p.count; i++) {
        const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        if (!seen.has(k)) seen.set(k, [rnd() * amt, rnd() * amt * 0.5, rnd() * amt]);
        const d = seen.get(k)!;
        p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const flat = (c: number) => new T.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
    const grass = shadowy(new T.Mesh(rough(new T.CylinderGeometry(0.5 * size, 0.53 * size, 0.14, 8), 0.04 * size), mat(top, 0.7)));
    grass.position.y = TOP - 0.07;
    g.add(grass);
    const dirt = shadowy(new T.Mesh(rough(new T.CylinderGeometry(0.53 * size, 0.44 * size, 0.2, 8), 0.05 * size), flat(0x7a5230)));
    dirt.position.y = TOP - 0.24;
    g.add(dirt);
    const rock = shadowy(new T.Mesh(rough(new T.ConeGeometry(0.44 * size, 0.7 * size, 7), 0.08 * size), flat(0x5d6168)));
    rock.rotation.x = Math.PI;
    rock.position.y = TOP - 0.34 - 0.35 * size;
    g.add(rock);
    return { group: g, top: grass };
  }

  /** A word label standing over a square, always facing the camera. */
  function label(text: string, colour: string) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const x = c.getContext("2d")!;
    x.fillStyle = "rgba(255,255,255,0.92)";
    x.beginPath();
    x.moveTo(24, 8);
    x.arcTo(248, 8, 248, 88, 22);
    x.arcTo(248, 88, 8, 88, 22);
    x.arcTo(8, 88, 8, 8, 22);
    x.arcTo(8, 8, 248, 8, 22);
    x.fill();
    x.lineWidth = 8;
    x.strokeStyle = colour;
    x.stroke();
    x.fillStyle = "#1E3A8A";
    x.font = "900 44px system-ui, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(text, 128, 50);
    const map = new T.CanvasTexture(c);
    map.encoding = T.sRGBEncoding;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map, transparent: true }));
    sprite.scale.set(1.15, 0.43, 1);
    return sprite;
  }

  // ---------- The ring of islands ----------
  const breathers: { obj: any; phase: number; period: number; shadow: any; glow: any }[] = [];
  const islands: { group: any; top: any; base: number; glow: any }[] = [];
  TILES.forEach((tile, i) => {
    const [x, z] = squarePoint(i);
    const big = tile.kind !== "coin";
    const isle = islandMesh(big ? 1.3 : 1.1, 200 + i * 23, TOPS[tile.kind]);
    isle.group.position.set(x, 0, z);
    scene.add(isle.group);
    const tag = label(labels[i] ?? tile.name, `#${TOPS[tile.kind].toString(16).padStart(6, "0")}`);
    tag.position.set(0, TOP + 0.55, 0);
    isle.group.add(tag);
    const shadow = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, FLOOR + 0.02, z);
    scene.add(shadow);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: tile.kind === "start" ? 0xffe27a : 0xaad2ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.45 }));
    glow.scale.set(1.5, 0.9, 1);
    glow.position.set(x, TOP - 1.2, z);
    scene.add(glow);
    breathers.push({ obj: isle.group, phase: Math.random() * Math.PI * 2, period: 3.2 + Math.random() * 1.2, shadow, glow });
    islands.push({ group: isle.group, top: isle.top, base: TOPS[tile.kind], glow });
  });
  const floor = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ color: 0x0f1a30, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  floor.receiveShadow = true;
  scene.add(floor);

  // Drifting motes of light.
  const count = 180, pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 24;
    pos[i * 3 + 1] = FLOOR + 0.5 + Math.random() * 7;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 24;
  }
  const moteGeo = new T.BufferGeometry();
  moteGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
  const motes = new T.Points(moteGeo, new T.PointsMaterial({ size: 0.12, map: glowTex, color: 0xcfe4ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  scene.add(motes);

  // ---------- The spaceship ----------
  const ship = new T.Group();
  const hullMat = mat(0xf3f4f6, 0.35, { metalness: 0.3 });
  const hull = shadowy(new T.Mesh(new T.SphereGeometry(0.28, 20, 14), hullMat));
  hull.scale.set(0.8, 0.7, 1.5);
  ship.add(hull);
  const nose = shadowy(new T.Mesh(new T.ConeGeometry(0.2, 0.35, 16), mat(0xe52521, 0.4)));
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.48;
  ship.add(nose);
  const dome = new T.Mesh(new T.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: 0x7dd3fc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }));
  dome.position.set(0, 0.14, 0.08);
  ship.add(dome);
  for (const s of [-1, 1]) {
    const wing = shadowy(new T.Mesh(new T.BoxGeometry(0.5, 0.04, 0.26), mat(0x1e3a8a, 0.4)));
    wing.position.set(s * 0.36, -0.02, -0.08);
    wing.rotation.z = s * -0.15;
    ship.add(wing);
    const tip = new T.Mesh(new T.SphereGeometry(0.04, 8, 6), new T.MeshBasicMaterial({ color: s < 0 ? 0xff4d4d : 0x4dff88 }));
    tip.position.set(s * 0.6, -0.06, -0.08);
    ship.add(tip);
  }
  const fin = shadowy(new T.Mesh(new T.BoxGeometry(0.04, 0.22, 0.2), mat(0xfbd000, 0.4)));
  fin.position.set(0, 0.16, -0.3);
  ship.add(fin);
  const flame = new T.Mesh(new T.ConeGeometry(0.12, 0.4, 12), new T.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.85 }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -0.55;
  ship.add(flame);
  scene.add(ship);
  const shipAt = { index: start, from: new T.Vector3(), to: new T.Vector3(), t: 1 };
  const spotOf = (i: number) => {
    const [x, z] = squarePoint(((i % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE);
    return new T.Vector3(x, TOP + 0.75, z);
  };
  ship.position.copy(spotOf(start));
  shipAt.to.copy(ship.position);

  // ---------- Camera: drag to turn and tilt, pinch to zoom, sway when left alone ----------
  const view = { yaw: 0, elev: 0.75, goalYaw: 0, goalElev: 0.75, dist: 20, goalDist: 20, idle: 0 };
  const target = new T.Vector3();
  const canvas = renderer.domElement;
  const pointers = new Map<number, { x: number; y: number }>();
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: PointerEvent) => {
    const before = pointers.get(e.pointerId);
    if (!before) return;
    const pts = [...pointers.values()];
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    view.idle = 0;
    if (pts.length === 1) {
      view.goalYaw -= (e.clientX - before.x) * 0.006;
      view.goalElev = Math.max(0.35, Math.min(1.35, view.goalElev + (e.clientY - before.y) * 0.004));
    } else {
      const other = pts.find((p) => p !== before)!;
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (was > 1 && is > 1) view.goalDist = Math.max(6, Math.min(45, view.goalDist * (was / is)));
    }
  };
  const onUp = (e: PointerEvent) => pointers.delete(e.pointerId);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    view.goalDist = Math.max(6, Math.min(45, view.goalDist * Math.exp(e.deltaY * 0.0012)));
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  let fitDist = 20;
  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Far enough back that the whole ring (about 2R across) fits the narrower side.
    const half = Math.atan(Math.tan((38 * Math.PI) / 360) * Math.min(1, camera.aspect));
    fitDist = Math.max(12, (R * 1.25) / Math.tan(half));
    view.goalDist = view.dist = fitDist;
  }
  const watch = new ResizeObserver(resize);
  watch.observe(container);
  resize();

  let lit: number | null = null;
  let frameId = 0;
  let last = performance.now();
  const floats: { sprite: any; born: number; base: any }[] = [];
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // Islands breathe, each on its own clock.
    if (!reduceMotion) {
      for (const b of breathers) {
        const h = Math.sin((now / 1000 / b.period) * Math.PI * 2 + b.phase) * 0.06;
        b.obj.position.y = h;
        const sc = 1 - h * 1.5;
        b.shadow.scale.set(sc, sc, 1);
        b.glow.position.y = TOP - 1.2 + h;
      }
      const p = moteGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * 0.18;
        if (y > 5) y = FLOOR + 0.5;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    islands.forEach((isle, i) => (isle.glow.material.opacity = i === lit ? 0.95 : 0.4));
    // The ship glides to its square with a little hop, hovers, and points the way it's going.
    if (shipAt.t < 1) {
      shipAt.t = Math.min(1, shipAt.t + dt / 0.22);
      ship.position.lerpVectors(shipAt.from, shipAt.to, shipAt.t);
      ship.position.y += Math.sin(shipAt.t * Math.PI) * 0.45;
    } else {
      ship.position.y = shipAt.to.y + Math.sin(now / 500) * 0.08;
    }
    ship.rotation.z = Math.sin(now / 700) * 0.08;
    flame.scale.set(1, 0.8 + Math.random() * 0.4, 1);
    // Floating words.
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i], k = (now - f.born) / 1400;
      f.sprite.position.set(f.base.x, f.base.y + 0.6 + k * 1.1, f.base.z);
      f.sprite.material.opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
      if (k >= 1) {
        scene.remove(f.sprite);
        floats.splice(i, 1);
      }
    }
    // Camera: ease to the player's angle; sway gently when left alone; keep the ship in view.
    view.idle += dt;
    view.yaw += (view.goalYaw - view.yaw) * Math.min(1, dt * 8);
    view.elev += (view.goalElev - view.elev) * Math.min(1, dt * 8);
    view.dist += (view.goalDist - view.dist) * Math.min(1, dt * 6);
    target.lerp(new T.Vector3(ship.position.x * 0.35, 0, ship.position.z * 0.35), Math.min(1, dt * 2));
    const sway = reduceMotion ? 0 : Math.sin(now / 7000) * 0.12 * Math.min(1, Math.max(0, view.idle - 2) / 3);
    const yaw = view.yaw + sway, flat = Math.cos(view.elev) * view.dist;
    camera.position.set(target.x + Math.sin(yaw) * flat, Math.sin(view.elev) * view.dist, target.z + Math.cos(yaw) * flat);
    camera.lookAt(target);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  return {
    moveTo(index) {
      if (index === shipAt.index) return;
      shipAt.index = index;
      shipAt.from.copy(ship.position);
      shipAt.to.copy(spotOf(index));
      shipAt.t = 0;
      ship.rotation.y = Math.atan2(shipAt.to.x - shipAt.from.x, shipAt.to.z - shipAt.from.z);
    },
    highlight(index) {
      lit = index;
    },
    floatText(text, colour = "#16A34A") {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 96;
      const x = c.getContext("2d")!;
      x.font = "900 60px system-ui, sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.lineWidth = 12;
      x.strokeStyle = "#ffffff";
      x.strokeText(text, 160, 50);
      x.fillStyle = colour;
      x.fillText(text, 160, 50);
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthTest: false }));
      sprite.scale.set(1.6, 0.48, 1);
      sprite.renderOrder = 10;
      scene.add(sprite);
      floats.push({ sprite, born: performance.now(), base: ship.position.clone() });
    },
    recentre() {
      view.goalYaw = 0;
      view.goalElev = 0.75;
      view.goalDist = fitDist;
    },
    dispose() {
      cancelAnimationFrame(frameId);
      watch.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      renderer.dispose();
      canvas.remove();
    },
  };
}
