/* eslint-disable @typescript-eslint/no-explicit-any -- three.js is loaded from a CDN at run time, untyped. */
/**
 * The 八字 board in real 3D (three.js r128, loaded from cdnjs on first use).
 *
 * Two diamonds side by side, crossing in the middle, seen from 40° up. A vampire castle stands in
 * the top notch and a treasure pile in the bottom one. Tiles are thick rounded blocks; a bought
 * lot takes its owner's colour and a building rises out of it. The camera flies in to whoever is
 * playing and follows each step, then pulls back between turns.
 *
 * Everything here is show only: the rules live in lib/eight.ts and the screen calls these
 * functions to play back the events a move produced.
 */
import { EDGE_STEPS, FORKS, LOOP, MIDDLE_AGAIN, ROAD_LENGTH, SQUARES, keyOf, type Spot } from "@/lib/eight";

const THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
let loading: Promise<any> | null = null;

/** Load three.js once; resolves with the THREE namespace. */
export function loadThree(): Promise<any> {
  const w = window as any;
  if (w.THREE) return Promise.resolve(w.THREE);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = THREE_URL;
      script.async = true;
      script.onload = () => (w.THREE ? resolve(w.THREE) : reject(new Error("three")));
      script.onerror = () => {
        loading = null;
        reject(new Error("three"));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}

export type BoardScene = {
  /** Fly in close to a seat, or null to pull back and see the whole board. */
  focus(seat: number | null): void;
  /** Speed up (e.g. 3 while computer players move with 快轉 on). */
  setSpeed(speed: number): void;
  roll(seat: number, dice: [number, number]): Promise<void>;
  hideDice(): void;
  stepTo(seat: number, spot: Spot): Promise<void>;
  flyTo(seat: number, spot: Spot): Promise<void>;
  /** Colour a lot for its owner and raise the building for its level. */
  own(key: string, seat: number, level: number): Promise<void>;
  /** Hand a lot back to the bank: plain tile, no building. */
  clear(key: string): void;
  coinsFly(from: number, to: number | null, count: number): Promise<void>;
  coinsBurst(seat: number, count: number): Promise<void>;
  pulse(seat: number, gold?: boolean): Promise<void>;
  removeToken(seat: number): void;
  wait(ms: number): Promise<void>;
  dispose(): void;
};

// ---------- Layout (world units; x right, z toward the viewer) ----------

const PITCH = 1.2;
const D = (EDGE_STEPS * PITCH) / Math.SQRT2;
const TURN = Math.PI / 4;
const TOP = 0.34;
const CORNERS: [number, number][] = [[-2 * D, 0], [-D, D], [0, 0], [D, -D], [2 * D, 0], [D, D], [0, 0], [-D, -D]];

function loopPoint(i: number): [number, number] {
  const s = Math.floor(i / EDGE_STEPS), k = i % EDGE_STEPS;
  const [ax, az] = CORNERS[s], [bx, bz] = CORNERS[(s + 1) % CORNERS.length];
  return [ax + ((bx - ax) * k) / EDGE_STEPS, az + ((bz - az) * k) / EDGE_STEPS];
}
function spotPoint(spot: Spot): [number, number] {
  if (spot.on === "loop") return loopPoint(spot.i);
  const [from, fork] = Object.entries(FORKS).find(([, f]) => f.road === spot.on)!;
  const [ax, az] = loopPoint(Number(from)), [bx, bz] = loopPoint(fork.exit);
  const t = spot.k / (ROAD_LENGTH + 1);
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

const GROUP_COLOURS = [0xe52521, 0xf59e0b, 0x22a447, 0x38bdf8, 0x3949ab, 0xec4899, 0x9a5b2e, 0x14b8a6];
const OFFSETS: [number, number][] = [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]];

export function createBoardScene(T: any, container: HTMLElement, colours: string[]): BoardScene {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let speed = 1;
  const pace = () => speed * (reduceMotion ? 10 : 1);

  // ---------- Renderer, scene, light ----------
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const sky = document.createElement("canvas");
  sky.width = 4;
  sky.height = 256;
  const sg = sky.getContext("2d")!;
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#2a1260");
  grad.addColorStop(0.5, "#8a3ea8");
  grad.addColorStop(0.85, "#f08a8a");
  grad.addColorStop(1, "#ffc98a");
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new T.CanvasTexture(sky);
  skyTex.encoding = T.sRGBEncoding;
  scene.background = skyTex;
  scene.fog = new T.Fog(0x7a3a8f, 50, 110);

  const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new T.HemisphereLight(0xfff1e0, 0x5b3b7a, 0.85));
  const sun = new T.DirectionalLight(0xffe2c2, 1.15);
  sun.position.set(-10, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const mat = (color: number, rough = 0.35, extra: object = {}) =>
    new T.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra));
  const shadowy = (mesh: any) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const Y = new T.Vector3(0, 1, 0);
  const toLocal = (v: any) => v.clone().applyAxisAngle(Y, -TURN);

  function roundedSquare(size: number, r: number) {
    const s = new T.Shape(), h = size / 2;
    s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
    s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h); s.lineTo(-h + r, h);
    s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
    return s;
  }
  function slab(size: number, depth: number, r: number, bevel: number) {
    const g = new T.ExtrudeGeometry(roundedSquare(size, r), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // Water, moon, stone deck, two diamond lawns.
  const water = new T.Mesh(new T.CircleGeometry(80, 64), mat(0x2b4c7e, 0.25, { metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.9;
  scene.add(water);
  const moon = new T.Mesh(new T.SphereGeometry(3, 32, 24), new T.MeshBasicMaterial({ color: 0xfff4c8, fog: false }));
  moon.position.set(-22, 20, -48);
  scene.add(moon);
  const deck = shadowy(new T.Mesh(slab(1, 0.8, 0.12, 0.02), mat(0x8d7aa8, 0.85)));
  deck.scale.set(4 * D + 3.4, 1, 2 * D + 3.4);
  deck.position.y = -0.95;
  scene.add(deck);
  for (const x of [-D, D]) {
    const lawn = shadowy(new T.Mesh(slab(EDGE_STEPS * PITCH - 1.2, 0.1, 0.4, 0.05), mat(0x5fae4a, 0.8)));
    lawn.rotation.y = TURN;
    lawn.position.set(x, -0.02, 0);
    scene.add(lawn);
  }

  // ---------- Tiles ----------
  const lotGeo = slab(1.06, 0.22, 0.2, 0.06), bigGeo = slab(1.4, 0.22, 0.26, 0.06);
  type Tile = { group: any; body: any; base: number; inward: any; house: any };
  const tiles: Record<string, Tile> = {};
  const floaters: { obj: any; base?: number; spin?: boolean; bat?: number }[] = [];

  function decorate(kind: string, group: any) {
    if (kind === "start") {
      const arrow = new T.Shape();
      arrow.moveTo(0, 0.5); arrow.lineTo(0.4, 0.04); arrow.lineTo(0.15, 0.04); arrow.lineTo(0.15, -0.45);
      arrow.lineTo(-0.15, -0.45); arrow.lineTo(-0.15, 0.04); arrow.lineTo(-0.4, 0.04); arrow.closePath();
      const g = new T.ExtrudeGeometry(arrow, { depth: 0.09, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const a = shadowy(new T.Mesh(g, mat(0xe52521)));
      a.position.y = TOP;
      const dir = toLocal(new T.Vector3(1, 0, 1));
      a.rotation.y = Math.atan2(-dir.x, -dir.z);
      group.add(a);
    }
    if (kind === "fork") {
      for (const [x, y, z] of [[0.3, 0.12, 0.9], [0.9, 0.12, 0.3]]) {
        const bar = shadowy(new T.Mesh(new T.BoxGeometry(x, y, z), mat(0xe52521)));
        bar.position.y = TOP + 0.06;
        group.add(bar);
      }
    }
    if (kind === "cross") {
      const star = new T.Shape();
      for (let n = 0; n < 10; n++) {
        const r = n % 2 ? 0.22 : 0.5, a = (n / 10) * Math.PI * 2;
        if (n) star.lineTo(Math.sin(a) * r, Math.cos(a) * r);
        else star.moveTo(Math.sin(a) * r, Math.cos(a) * r);
      }
      star.closePath();
      const g = new T.ExtrudeGeometry(star, { depth: 0.1, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const s = shadowy(new T.Mesh(g, mat(0xfbd000, 0.2, { metalness: 0.4 })));
      s.position.y = TOP;
      group.add(s);
    }
    if (kind === "jail") {
      for (let b = -2; b <= 2; b++) {
        const bar = shadowy(new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.8, 10), mat(0xd1d5db, 0.3)));
        bar.position.set(b * 0.2, TOP + 0.4, 0);
        group.add(bar);
      }
      const top = shadowy(new T.Mesh(new T.BoxGeometry(1, 0.1, 0.14), mat(0x94a3b8, 0.3)));
      top.position.y = TOP + 0.82;
      group.add(top);
    }
    if (kind === "chest") {
      const box = shadowy(new T.Mesh(new T.BoxGeometry(0.8, 0.45, 0.55), mat(0x9a5b2e, 0.6)));
      box.position.y = TOP + 0.23;
      group.add(box);
      const lid = shadowy(new T.Mesh(new T.CylinderGeometry(0.275, 0.275, 0.8, 20, 1, false, 0, Math.PI), mat(0x9a5b2e, 0.6)));
      lid.rotation.z = Math.PI / 2;
      lid.position.y = TOP + 0.45;
      group.add(lid);
      const strap = shadowy(new T.Mesh(new T.BoxGeometry(0.12, 0.76, 0.58), mat(0xfbd000, 0.2, { metalness: 0.5 })));
      strap.position.y = TOP + 0.36;
      group.add(strap);
    }
    if (kind === "fly") {
      const plane = new T.Group();
      const hull = shadowy(new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.9, 12), mat(0xffffff, 0.3)));
      hull.rotation.z = Math.PI / 2;
      plane.add(hull);
      plane.add(shadowy(new T.Mesh(new T.BoxGeometry(0.22, 0.04, 1.0), mat(0xe52521))));
      const tail = shadowy(new T.Mesh(new T.BoxGeometry(0.14, 0.26, 0.04), mat(0xe52521)));
      tail.position.set(-0.4, 0.14, 0);
      plane.add(tail);
      plane.position.y = TOP + 0.6;
      group.add(plane);
      floaters.push({ obj: plane, base: TOP + 0.6, spin: true });
    }
    if (kind === "chance") {
      const q = new T.Group();
      const arc = shadowy(new T.Mesh(new T.TorusGeometry(0.2, 0.07, 10, 24, Math.PI * 1.5), mat(0xffffff, 0.25)));
      arc.rotation.z = -Math.PI / 2;
      arc.position.y = 0.35;
      q.add(arc);
      const stem = shadowy(new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.18, 12), mat(0xffffff, 0.25)));
      stem.position.y = 0.06;
      q.add(stem);
      const dot = shadowy(new T.Mesh(new T.SphereGeometry(0.08, 16, 12), mat(0xffffff, 0.25)));
      dot.position.y = -0.2;
      q.add(dot);
      q.position.y = TOP + 0.55;
      group.add(q);
      floaters.push({ obj: q, base: TOP + 0.55, spin: true });
    }
    if (kind === "tax") {
      const bag = shadowy(new T.Mesh(new T.SphereGeometry(0.28, 18, 14), mat(0xd6b370, 0.6)));
      bag.scale.y = 0.9;
      bag.position.y = TOP + 0.26;
      group.add(bag);
      const knot = shadowy(new T.Mesh(new T.ConeGeometry(0.14, 0.2, 12), mat(0xd6b370, 0.6)));
      knot.position.y = TOP + 0.56;
      group.add(knot);
      const tie = shadowy(new T.Mesh(new T.TorusGeometry(0.1, 0.03, 8, 16), mat(0xe52521)));
      tie.rotation.x = Math.PI / 2;
      tie.position.y = TOP + 0.48;
      group.add(tie);
    }
  }

  const PLAIN: Record<string, number> = {
    start: 0xfbd000, jail: 0x64748b, chest: 0xf2c230, fly: 0x38bdf8, chance: 0x8b5cf6, tax: 0x334155, fork: 0xffffff, cross: 0xff7a59,
  };
  function makeTile(key: string, x: number, z: number, outward: any) {
    const square = SQUARES[key];
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = TURN;
    scene.add(group);
    const base = square.kind === "lot" ? (square.gold ? 0xffe9a8 : 0xfff4dc) : PLAIN[square.kind];
    const big = ["start", "jail", "chest", "fly", "cross"].includes(square.kind);
    const body = shadowy(new T.Mesh(big ? bigGeo : lotGeo, mat(base, 0.32)));
    group.add(body);
    const tile: Tile = { group, body, base, inward: toLocal(new T.Vector3(0, 0, -0.16)), house: null };
    tiles[key] = tile;
    if (square.kind === "lot" && outward) {
      const o = toLocal(outward);
      const ox = Math.round(o.x), oz = Math.round(o.z);
      const band = shadowy(new T.Mesh(new T.BoxGeometry(ox ? 0.26 : 0.9, 0.07, oz ? 0.26 : 0.9), mat(GROUP_COLOURS[square.group % 8], 0.4)));
      band.position.set(ox * 0.34, TOP + 0.02, oz * 0.34);
      group.add(band);
      tile.inward = new T.Vector3(-ox * 0.14, 0, -oz * 0.14);
    }
    if (square.gold) {
      const gem = shadowy(new T.Mesh(new T.OctahedronGeometry(0.12), mat(0xfbd000, 0.15, { metalness: 0.6, emissive: 0x5a3d00 })));
      gem.position.set(0.3, TOP + 0.12, 0.3);
      group.add(gem);
    }
    decorate(square.kind, group);
  }
  for (let i = 0; i < LOOP; i++) {
    if (i === MIDDLE_AGAIN) continue;
    const [x, z] = loopPoint(i);
    const cx = x < 0 ? -D : D;
    const dx = Math.sign(Math.round((x - cx) * 100)), dz = Math.sign(Math.round(z * 100));
    makeTile(keyOf({ on: "loop", i }), x, z, dx && dz ? new T.Vector3(dx, 0, dz) : null);
  }
  for (const road of ["L", "R"] as const) {
    for (let k = 1; k <= ROAD_LENGTH; k++) {
      const [x, z] = spotPoint({ on: road, k });
      makeTile(`${road}${k}`, x, z, null);
    }
  }

  // ---------- Castle in the top notch, treasure in the bottom one ----------
  const castleZ = -D + 0.3;
  {
    const c = new T.Group();
    const stone = mat(0xd9cfe8, 0.7), dark = mat(0x5b3b7a, 0.5), roof = mat(0xc0264b, 0.4);
    const keep = shadowy(new T.Mesh(new T.BoxGeometry(2.6, 1.8, 2.6), stone));
    keep.position.y = 0.9;
    c.add(keep);
    for (let n = 0; n < 8; n++) {
      const b = shadowy(new T.Mesh(new T.BoxGeometry(0.4, 0.3, 0.4), stone));
      const a = (n / 8) * Math.PI * 2;
      b.position.set(Math.cos(a) * 1.15, 1.95, Math.sin(a) * 1.15);
      c.add(b);
    }
    const hall = shadowy(new T.Mesh(new T.CylinderGeometry(0.75, 0.85, 2.4, 20), stone));
    hall.position.y = 2.6;
    c.add(hall);
    const spire = shadowy(new T.Mesh(new T.ConeGeometry(1.0, 1.6, 20), roof));
    spire.position.y = 4.6;
    c.add(spire);
    const flag = shadowy(new T.Mesh(new T.BoxGeometry(0.5, 0.3, 0.03), mat(0xfbd000, 0.3)));
    flag.position.set(0.3, 5.7, 0);
    c.add(flag);
    const pole = shadowy(new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.7, 8), dark));
    pole.position.set(0, 5.6, 0);
    c.add(pole);
    for (const [x, z] of [[1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]]) {
      const tower = shadowy(new T.Mesh(new T.CylinderGeometry(0.45, 0.5, 2.6, 16), stone));
      tower.position.set(x, 1.3, z);
      c.add(tower);
      const cap = shadowy(new T.Mesh(new T.ConeGeometry(0.62, 1.1, 16), roof));
      cap.position.set(x, 3.15, z);
      c.add(cap);
      const win = new T.Mesh(new T.BoxGeometry(0.16, 0.3, 0.02), new T.MeshBasicMaterial({ color: 0xffd36b }));
      win.position.set(x, 1.9, z + Math.sign(z) * 0.49);
      c.add(win);
    }
    const door = shadowy(new T.Mesh(new T.BoxGeometry(0.9, 0.9, 0.08), dark));
    door.position.set(0, 0.45, 1.31);
    c.add(door);
    c.scale.setScalar(0.7);
    c.position.set(0, 0, castleZ);
    scene.add(c);
    for (let n = 0; n < 5; n++) {
      const bat = new T.Group();
      const wingGeo = new T.ConeGeometry(0.18, 0.5, 3);
      wingGeo.rotateZ(Math.PI / 2);
      const l = new T.Mesh(wingGeo, mat(0x1f1235, 0.6));
      l.position.x = -0.22;
      bat.add(l);
      const r = new T.Mesh(wingGeo, mat(0x1f1235, 0.6));
      r.rotation.z = Math.PI;
      r.position.x = 0.22;
      bat.add(r);
      bat.add(new T.Mesh(new T.SphereGeometry(0.1, 10, 8), mat(0x1f1235, 0.6)));
      scene.add(bat);
      floaters.push({ obj: bat, bat: n });
    }
    const pile = new T.Group();
    const box = shadowy(new T.Mesh(new T.BoxGeometry(1.0, 0.55, 0.7), mat(0x9a5b2e, 0.6)));
    box.position.y = 0.28;
    pile.add(box);
    const lid = shadowy(new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 1.0, 20, 1, false, 0, Math.PI), mat(0x9a5b2e, 0.6)));
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.55;
    pile.add(lid);
    const strap = shadowy(new T.Mesh(new T.BoxGeometry(0.14, 0.95, 0.74), mat(0xfbd000, 0.2, { metalness: 0.5 })));
    strap.position.y = 0.45;
    pile.add(strap);
    for (let k = 0; k < 14; k++) {
      const coin = shadowy(new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 0.05, 20), mat(0xfbd000, 0.2, { metalness: 0.6 })));
      const a = k * 2.4, r = 0.65 + (k % 3) * 0.15;
      coin.position.set(Math.cos(a) * r, 0.05 + (k % 4) * 0.04, Math.sin(a) * r * 0.6);
      coin.rotation.x = (k % 3) * 0.3;
      pile.add(coin);
    }
    pile.position.set(0, 0, D - 0.9);
    pile.scale.setScalar(0.8);
    scene.add(pile);
  }

  // ---------- Tokens ----------
  function pawn(color: number) {
    const g = new T.Group();
    const m = mat(color, 0.25);
    const base = shadowy(new T.Mesh(new T.CylinderGeometry(0.2, 0.25, 0.1, 20), m));
    base.position.y = 0.05;
    g.add(base);
    const body = shadowy(new T.Mesh(new T.CylinderGeometry(0.1, 0.19, 0.4, 20), m));
    body.position.y = 0.3;
    g.add(body);
    const head = shadowy(new T.Mesh(new T.SphereGeometry(0.17, 20, 16), m));
    head.position.y = 0.63;
    g.add(head);
    for (const x of [-0.06, 0.06]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.045, 10, 8), mat(0xffffff, 0.2));
      eye.position.set(x, 0.66, 0.14);
      g.add(eye);
      const dot = new T.Mesh(new T.SphereGeometry(0.022, 8, 6), mat(0x111111, 0.2));
      dot.position.set(x, 0.66, 0.18);
      g.add(dot);
    }
    return g;
  }
  const hex = (css: string) => parseInt(css.replace("#", ""), 16);
  const place = (seat: number, spot: Spot) => {
    const [x, z] = spotPoint(spot);
    const [ox, oz] = OFFSETS[seat % 4];
    return new T.Vector3(x + ox, TOP, z + oz);
  };
  const tokens = colours.map((css, seat) => {
    const g = pawn(hex(css));
    g.position.copy(place(seat, { on: "loop", i: 0 }));
    scene.add(g);
    return g;
  });
  const face = (seat: number, target: any) => {
    const p = tokens[seat].position;
    tokens[seat].rotation.y = Math.atan2(target.x - p.x, target.z - p.z);
  };

  // ---------- Dice ----------
  function dieFace(n: number) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = n === 1 ? "#e52521" : "#1e3a8a";
    const spots: Record<number, number[][]> = {
      1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[30, 30], [64, 64], [98, 98]],
      4: [[34, 34], [94, 34], [34, 94], [94, 94]], 5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]],
      6: [[34, 30], [94, 30], [34, 64], [94, 64], [34, 98], [94, 98]],
    };
    for (const [a, b] of spots[n]) {
      x.beginPath();
      x.arc(a, b, n === 1 ? 18 : 12, 0, Math.PI * 2);
      x.fill();
    }
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }
  const dieMats = [1, 6, 2, 5, 3, 4].map((n) => new T.MeshStandardMaterial({ map: dieFace(n), roughness: 0.3 }));
  const dice = [0, 1].map(() => {
    const d = shadowy(new T.Mesh(new T.BoxGeometry(0.6, 0.6, 0.6), dieMats));
    d.visible = false;
    scene.add(d);
    return d;
  });
  const UP: Record<number, [number, number, number]> = {
    2: [0, 0, 0], 5: [Math.PI, 0, 0], 1: [0, 0, Math.PI / 2], 6: [0, 0, -Math.PI / 2], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0],
  };

  // ---------- Animation clock ----------
  const anims: { start: number; ms: number; step: (k: number) => void; resolve: () => void }[] = [];
  const timers = new Set<number>();
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        resolve();
      }, ms / pace());
      timers.add(id);
    });
  const tween = (ms: number, step: (k: number) => void) =>
    new Promise<void>((resolve) => anims.push({ start: performance.now(), ms: ms / pace(), step, resolve }));

  // ---------- Camera: 40° down; close on the player, wide between turns ----------
  const ELEV = (40 * Math.PI) / 180;
  const WIDE = { dist: 26, target: new T.Vector3(0, 0, 0.4) };
  const CLOSE = 13;
  const cam = { target: WIDE.target.clone(), dist: WIDE.dist };
  const goal = { target: WIDE.target.clone(), dist: WIDE.dist, follow: -1 };
  let dragged = false;

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
    dragged = true;
    if (pts.length === 1) {
      const k = cam.dist / 700;
      goal.target.x = Math.max(-10, Math.min(10, goal.target.x - (e.clientX - before.x) * k));
      goal.target.z = Math.max(-10, Math.min(11, goal.target.z - ((e.clientY - before.y) * k) / Math.sin(ELEV)));
      cam.target.copy(goal.target);
    } else {
      const other = pts.find((p) => p !== before)!;
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (was > 1 && is > 1) goal.dist = cam.dist = Math.max(6, Math.min(56, cam.dist * (was / is)));
    }
  };
  const onUp = (e: PointerEvent) => pointers.delete(e.pointerId);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    goal.dist = cam.dist = Math.max(6, Math.min(56, cam.dist * Math.exp(e.deltaY * 0.0012)));
    dragged = true;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    WIDE.dist = w / h < 0.8 ? 50 : w / h < 1.3 ? 34 : 26;
    if (goal.follow < 0) goal.dist = WIDE.dist;
    camera.updateProjectionMatrix();
  }
  const watch = new ResizeObserver(resize);
  watch.observe(container);
  resize();

  let frameId = 0;
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const k = Math.min(1, (now - a.start) / a.ms);
      a.step(k);
      if (k >= 1) {
        anims.splice(i, 1);
        a.resolve();
      }
    }
    if (goal.follow >= 0 && !dragged) {
      const p = tokens[goal.follow].position;
      goal.target.set(p.x, 0, p.z - 0.6);
    }
    const ease = 1 - Math.pow(0.03, dt * speed);
    if (!dragged || goal.follow < 0) cam.target.lerp(goal.target, ease);
    cam.dist += (goal.dist - cam.dist) * ease;
    if (!reduceMotion) {
      floaters.forEach((f, i) => {
        if (f.bat !== undefined) {
          const a = now / 1400 + (f.bat * Math.PI * 2) / 5;
          f.obj.position.set(Math.cos(a) * 1.8, 3.4 + Math.sin(now / 300 + f.bat) * 0.3, castleZ + Math.sin(a) * 1.8);
          f.obj.rotation.y = -a;
          f.obj.children[0].rotation.x = f.obj.children[1].rotation.x = Math.sin(now / 80 + f.bat) * 0.6;
          return;
        }
        if (f.spin) f.obj.rotation.y += dt * 1.4;
        f.obj.position.y = (f.base ?? 0) + Math.sin(now / 400 + i) * 0.08;
      });
    }
    camera.position.set(cam.target.x, cam.target.y + Math.sin(ELEV) * cam.dist, cam.target.z + Math.cos(ELEV) * cam.dist);
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  // ---------- Effects ----------
  const coinGeo = new T.CylinderGeometry(0.14, 0.14, 0.04, 18);
  const coinMat = mat(0xfbd000, 0.2, { metalness: 0.6, emissive: 0x6b4a00 });
  const squash = (key: string) => {
    const tile = tiles[key];
    if (!tile) return;
    void tween(260, (k) => (tile.group.position.y = -Math.sin(k * Math.PI) * 0.08));
  };

  function house(color: number, w: number, h: number) {
    const g = new T.Group();
    const body = shadowy(new T.Mesh(new T.BoxGeometry(w, h, w), mat(0xfff1d6)));
    body.position.y = h / 2;
    g.add(body);
    const roof = shadowy(new T.Mesh(new T.ConeGeometry(w * 0.85, w * 0.7, 4), mat(color)));
    roof.position.y = h + w * 0.35;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    const door = new T.Mesh(new T.BoxGeometry(w * 0.3, h * 0.5, 0.01), mat(0x7c4a1e));
    door.position.set(0, h * 0.25, w / 2 + 0.006);
    g.add(door);
    return g;
  }
  function buildingFor(level: number, color: number) {
    const g = new T.Group();
    if (level === 1) g.add(house(color, 0.36, 0.3));
    if (level === 2) {
      const a = house(color, 0.3, 0.28);
      a.position.x = -0.17;
      g.add(a);
      const b = house(color, 0.3, 0.42);
      b.position.x = 0.17;
      g.add(b);
    }
    if (level === 3) {
      const tower = shadowy(new T.Mesh(new T.BoxGeometry(0.42, 0.9, 0.42), mat(0xe8eef8, 0.3)));
      tower.position.y = 0.45;
      g.add(tower);
      for (let r = 0; r < 4; r++) {
        for (const x of [-0.1, 0.1]) {
          const w = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.01), new T.MeshBasicMaterial({ color: 0xffd36b }));
          w.position.set(x, 0.2 + r * 0.19, 0.216);
          g.add(w);
        }
      }
      const cap = shadowy(new T.Mesh(new T.BoxGeometry(0.48, 0.08, 0.48), mat(color)));
      cap.position.y = 0.94;
      g.add(cap);
    }
    if (level >= 4) {
      const base = shadowy(new T.Mesh(new T.CylinderGeometry(0.3, 0.36, 0.5, 20), mat(0xfff1d6)));
      base.position.y = 0.25;
      g.add(base);
      const mid = shadowy(new T.Mesh(new T.CylinderGeometry(0.2, 0.26, 0.5, 20), mat(color)));
      mid.position.y = 0.75;
      g.add(mid);
      const dome = shadowy(new T.Mesh(new T.SphereGeometry(0.22, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfbd000, 0.15, { metalness: 0.7, emissive: 0x5a3d00 })));
      dome.position.y = 1.0;
      g.add(dome);
      const tip = shadowy(new T.Mesh(new T.ConeGeometry(0.05, 0.3, 10), mat(0xfbd000, 0.15, { metalness: 0.7 })));
      tip.position.y = 1.35;
      g.add(tip);
    }
    return g;
  }

  const api: BoardScene = {
    focus(seat) {
      dragged = false;
      if (seat === null) {
        goal.follow = -1;
        goal.target.copy(WIDE.target);
        goal.dist = WIDE.dist;
      } else {
        goal.follow = seat;
        goal.dist = CLOSE;
      }
    },
    setSpeed(value) {
      speed = value;
    },
    async roll(seat, values) {
      const base = tokens[seat].position;
      dice.forEach((d, i) => {
        d.visible = true;
        d.position.set(base.x + (i ? 0.45 : -0.45), 2.5, base.z + 1.1);
      });
      const spins = dice.map(() => [Math.random() * 8 + 6, Math.random() * 8 + 6, Math.random() * 8 + 6]);
      await tween(750, (k) => {
        dice.forEach((d, i) => {
          d.rotation.set(spins[i][0] * (1 - k), spins[i][1] * (1 - k), spins[i][2] * (1 - k));
          if (k === 1) d.rotation.set(...UP[values[i]]);
          d.position.y = TOP + 0.3 + Math.abs(Math.sin(k * Math.PI * 2.5)) * (1 - k) * 2;
        });
      });
    },
    hideDice() {
      dice.forEach((d) => (d.visible = false));
    },
    async stepTo(seat, spot) {
      const token = tokens[seat];
      const from = token.position.clone(), to = place(seat, spot);
      face(seat, to);
      await tween(230, (k) => {
        token.position.lerpVectors(from, to, k);
        token.position.y = TOP + Math.sin(k * Math.PI) * 0.6;
      });
      squash(keyOf(spot));
    },
    async flyTo(seat, spot) {
      const token = tokens[seat];
      const from = token.position.clone(), to = place(seat, spot);
      face(seat, to);
      await tween(1100, (k) => {
        token.position.lerpVectors(from, to, k);
        token.position.y = TOP + Math.sin(k * Math.PI) * 4.5;
        token.rotation.y += 0.2;
      });
      squash(keyOf(spot));
    },
    async own(key, seat, level) {
      const tile = tiles[key];
      if (!tile) return;
      const color = hex(colours[seat]);
      const m = tile.body.material, from = m.color.clone(), to = new T.Color(color).lerp(new T.Color(0xffffff), 0.35);
      if (tile.house) tile.group.remove(tile.house);
      const g = buildingFor(level, color);
      g.position.copy(tile.inward).setY(TOP + 0.03);
      g.rotation.y = -TURN;
      g.scale.set(1, 0.01, 1);
      tile.group.add(g);
      tile.house = g;
      await tween(700, (k) => {
        m.color.copy(from).lerp(to, Math.min(1, k * 1.5));
        const s = k < 0.75 ? (k / 0.75) * 1.2 : 1.2 - ((k - 0.75) / 0.25) * 0.2;
        g.scale.set(1, Math.max(0.01, s), 1);
      });
    },
    clear(key) {
      const tile = tiles[key];
      if (!tile) return;
      if (tile.house) tile.group.remove(tile.house);
      tile.house = null;
      tile.body.material.color.setHex(tile.base);
    },
    async coinsFly(fromSeat, toSeat, count) {
      const from = tokens[fromSeat].position.clone();
      const to = toSeat === null ? new T.Vector3(0, 2.5, castleZ) : tokens[toSeat].position.clone();
      const jobs: Promise<void>[] = [];
      for (let n = 0; n < Math.min(Math.max(count, 1) * 2, 12); n++) {
        const coin = new T.Mesh(coinGeo, coinMat);
        coin.rotation.x = Math.PI / 2;
        scene.add(coin);
        const a = from.clone().add(new T.Vector3((Math.random() - 0.5) * 0.4, 0.8, (Math.random() - 0.5) * 0.4));
        const b = to.clone().add(new T.Vector3((Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3));
        jobs.push(
          wait(n * 60).then(() =>
            tween(650, (k) => {
              coin.position.lerpVectors(a, b, k);
              coin.position.y += Math.sin(k * Math.PI) * 2.2;
              coin.rotation.z += 0.3;
              if (k === 1) scene.remove(coin);
            }),
          ),
        );
      }
      await Promise.all(jobs);
    },
    async coinsBurst(seat, count) {
      const at = tokens[seat].position.clone();
      const jobs: Promise<void>[] = [];
      for (let n = 0; n < Math.min(count * 3, 14); n++) {
        const coin = new T.Mesh(coinGeo, coinMat);
        scene.add(coin);
        const ang = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 0.6;
        jobs.push(
          tween(800, (k) => {
            coin.position.set(at.x + Math.cos(ang) * r * k, at.y + 0.4 + Math.sin(k * Math.PI) * 1.8, at.z + Math.sin(ang) * r * k);
            coin.rotation.x += 0.25;
            coin.rotation.z += 0.2;
            if (k === 1) scene.remove(coin);
          }),
        );
      }
      await Promise.all(jobs);
    },
    async pulse(seat, gold = false) {
      const at = tokens[seat].position;
      const ring = new T.Mesh(
        new T.RingGeometry(0.3, 0.42, 32),
        new T.MeshBasicMaterial({ color: gold ? 0xfbd000 : hex(colours[seat]), transparent: true, side: T.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(at.x, TOP + 0.05, at.z);
      scene.add(ring);
      await tween(600, (k) => {
        ring.scale.setScalar(1 + k * 3);
        ring.material.opacity = 1 - k;
        if (k === 1) scene.remove(ring);
      });
    },
    removeToken(seat) {
      tokens[seat].visible = false;
    },
    wait,
    dispose() {
      cancelAnimationFrame(frameId);
      timers.forEach((id) => window.clearTimeout(id));
      anims.length = 0;
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
  return api;
}
