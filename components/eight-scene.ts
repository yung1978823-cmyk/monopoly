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
import { BOARDS, CLOVER_LOOP, CLOVER_PETAL, EDGE_STEPS, cloverKey, FORKS, ISLAND_LOOP, LOOP, MIDDLE_AGAIN, ROAD_LENGTH, keyOf, type BoardId, type Spot } from "@/lib/eight";
import { GALAXY_SPACE, TABLE_SPACE, createSpace, type Backdrop } from "@/components/backdrop";

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

const GLTF_URL = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js";
let gltfLoading: Promise<any> | null = null;

/** Load three.js's model loader once (after three.js itself). */
export function loadGltfLoader(T: any): Promise<any> {
  if (T.GLTFLoader) return Promise.resolve(T.GLTFLoader);
  if (!gltfLoading) {
    gltfLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GLTF_URL;
      script.async = true;
      script.onload = () => (T.GLTFLoader ? resolve(T.GLTFLoader) : reject(new Error("gltf")));
      script.onerror = () => {
        gltfLoading = null;
        reject(new Error("gltf"));
      };
      document.head.appendChild(script);
    });
  }
  return gltfLoading;
}

/**
 * The 3D characters. Each file carries a rigged body and three clips — "walk" (their own way of
 * walking), "cheer" and "special" — so no two players move alike.
 */
export const ACTORS: Record<string, { url: string; walkPace: number }> = {
  vampire: { url: "/models/vampire.glb", walkPace: 2.4 },
  jiangshi: { url: "/models/jiangshi.glb", walkPace: 1.5 },
  mummy: { url: "/models/mummy.glb", walkPace: 2.2 },
  zombie: { url: "/models/zombie.glb", walkPace: 2.2 },
};
export const CHARACTER_HEIGHT = 0.8;
const FIREWORK_COLOURS = [0xfbd000, 0xe52521, 0x22c55e, 0x3b82f6, 0xec4899, 0xf97316];

export type BoardScene = {
  /** Fly in close to a seat, or null to pull back and see the whole board. */
  /** Follow a seat close up ("near") or from a little further back ("mid"); null shows the whole board. */
  focus(seat: number | null, level?: "near" | "mid"): void;
  /** Speed up (e.g. 3 while computer players move with 快轉 on). */
  setSpeed(speed: number): void;
  /** Throw one die beside a seat: die 0 clears the table first; die 1 lands next to it. */
  roll(seat: number, which: 0 | 1, value: number): Promise<void>;
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
  /** A rocket goes up over a seat and bursts into coloured sparks (landmarks, the winner). */
  fireworks(seat: number, shots?: number): Promise<void>;
  /** Gold twinkles rising from a seat (chests) or around the dice (doubles). */
  sparkle(seat: number | "dice"): Promise<void>;
  /** A 3D character celebrates (seats with pawns do nothing); doesn't hold up the game. */
  cheer(seat: number): void;
  /** A 3D character's own special move (bow, spell, shield, hammer); doesn't hold up the game. */
  special(seat: number): void;
  /** Words that float up from a seat and fade, e.g. "−1.5" when paying rent. */
  floatText(seat: number, text: string, colour?: string): Promise<void>;
  /** 封地: chains and a padlock on a lot (or take them off). */
  lockTile(key: string, locked: boolean): void;
  /** 拆樓: an explosion of fire and rubble on a lot. */
  blast(key: string): Promise<void>;
  /** A puff of smoke round a seat. */
  puff(seat: number): Promise<void>;
  /** Put a seat straight onto a square, no walking (換位, hidden by puffs of smoke). */
  warp(seat: number, spot: Spot): void;
  /** A rainbow over a seat (passing start). */
  rainbow(seat: number): Promise<void>;
  /** A seat goes to pieces (bankrupt) and leaves the board. */
  shatter(seat: number): Promise<void>;
  /** A glowing power card appears over a square (they stay until someone takes them). */
  showPickup(key: string, icon?: string): Promise<void>;
  /** The card over `key` flies into a seat's hands. */
  takePickup(seat: number, key: string): Promise<void>;
  /** 怪獸卡: `side`'s monster fires (fireball or cannonball) at a seat, which is knocked back to `to` — or a shield bubble stops it. */
  monsterAttack(side: "left" | "right", seat: number, to: Spot, blocked: boolean): Promise<void>;
  removeToken(seat: number): void;
  wait(ms: number): Promise<void>;
  /** 領地 buildings on show: rent houses on their squares, a gold facade, train stations. */
  setDecor(decor: Decor): void;
  dispose(): void;
};

export type Decor = { houses: string[]; facade: boolean; stations: number };

// ---------- Layout (world units; x right, z toward the viewer) ----------

// Squares are floating islands now: a little further apart (+10%) so each one reads on its own.
const PITCH = 1.32;
/** Island size: a little smaller than before (Sky 2026-10-01) so there's open air between squares, like the single-player board. */
const ISLE = 1.0;
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

/** 海島: a ring of 20 around the lighthouse; square 0 faces the viewer. */
const ISLAND_R = 4.1;
function islandPoint(i: number): [number, number] {
  const a = (2 * Math.PI * i) / ISLAND_LOOP;
  return [ISLAND_R * Math.sin(a), ISLAND_R * Math.cos(a)];
}

/**
 * 三葉草 (領地 海島, Sky 2026-10-09): the squares sit where Sky's painted island has them — plaza at the front, the
 * quarry up the left, the forest arc at the back, the mine down the right. Picture pixels → world units.
 */
export const CLOVER_ART_POINTS: readonly [number, number][] = [
  [508, 1048],
  [297, 888], [366, 829], [384, 750], [350, 677], [296, 621], [212, 589],
  [280, 424], [322, 363], [405, 322], [513, 321], [596, 359], [639, 423],
  [735, 588], [653, 644], [599, 708], [585, 785], [625, 856], [712, 890],
];
const CLOVER_POINTS: Record<string, [number, number]> = Object.fromEntries(
  CLOVER_ART_POINTS.map(([px, py], i) => [`o${i}`, [(px - 476) / 75, ((py - 680) / 75) * 1.3]]),
);

type TilePlan = { key: string; x: number; z: number; yaw: number; outward: [number, number] | null };
type Layout = {
  tiles: TilePlan[];
  spotPoint: (spot: Spot) => [number, number];
  /** Where tax coins fly to and bats circle. */
  hub: [number, number, number];
  stations: [number, number][];
  /** Wide-shot distance for tall, square-ish and wide screens. */
  wide: [number, number, number];
  wideTarget: [number, number];
};

function layoutFor(board: BoardId): Layout {
  if (board === "clover") {
    const tiles: TilePlan[] = Object.entries(CLOVER_POINTS).map(([key, [x, z]]) => ({ key, x, z, yaw: 0, outward: null }));
    const R = 7;
    return {
      tiles,
      spotPoint: (spot) => CLOVER_POINTS[cloverKey(spot.on === "loop" ? spot.i : 0)],
      hub: [0, 3, 0],
      stations: [[R, 1.5], [-R, 1.5], [R * 0.7, -R * 0.7], [-R * 0.7, -R * 0.7], [2.2, R], [-2.2, R]],
      wide: [40, 28, 22],
      wideTarget: [0, 0.3],
    };
  }
  if (board === "island") {
    const tiles: TilePlan[] = [];
    for (let i = 0; i < ISLAND_LOOP; i++) {
      const [x, z] = islandPoint(i);
      const a = (2 * Math.PI * i) / ISLAND_LOOP;
      tiles.push({ key: `o${i}`, x, z, yaw: a, outward: [Math.sin(a), Math.cos(a)] });
    }
    const R = ISLAND_R + 2.2;
    return {
      tiles,
      spotPoint: (spot) => islandPoint(spot.on === "loop" ? spot.i : 0),
      hub: [0, 3, 0],
      stations: [[R, 1.5], [-R, 1.5], [R * 0.7, -R * 0.7], [-R * 0.7, -R * 0.7], [2.2, R], [-2.2, R]],
      wide: [44, 24, 19],
      wideTarget: [0, 0.3],
    };
  }
  const tiles: TilePlan[] = [];
  for (let i = 0; i < LOOP; i++) {
    if (i === MIDDLE_AGAIN) continue;
    const [x, z] = loopPoint(i);
    const cx = x < 0 ? -D : D;
    const dx = Math.sign(Math.round((x - cx) * 100)), dz = Math.sign(Math.round(z * 100));
    tiles.push({ key: keyOf({ on: "loop", i }), x, z, yaw: TURN, outward: dx && dz ? [dx, dz] : null });
  }

  return {
    tiles,
    spotPoint,
    hub: [0, 2.5, -D + 0.3],
    stations: [[-2 * D - 1.6, 0], [2 * D + 1.6, 0], [-D, D + 1.2], [D, D + 1.2], [-D, -D - 1.2], [D, -D - 1.2]],
    wide: [44, 38, 29],
    wideTarget: [0, 0.4],
  };
}

const GROUP_COLOURS = [0xe52521, 0xf59e0b, 0x22a447, 0x38bdf8, 0x3949ab, 0xec4899, 0x9a5b2e, 0x14b8a6];

/**
 * `actors` names each seat's 3D character (a key of ACTORS, or null for a pawn). If a model
 * can't load, that seat simply keeps its pawn.
 */
export function createBoardScene(
  T: any,
  container: HTMLElement,
  colours: string[],
  decor?: Decor,
  board: BoardId = "eight",
  actors?: (string | null)[],
  /** see-through: no sky, fog or sea — the island floats over whatever is behind the canvas (領地 preview). */
  opts: { seeThrough?: boolean } = {},
): BoardScene {
  const layout = layoutFor(board);
  const seeThrough = !!opts.seeThrough;
  /** 海島 and 三葉草 share the sandy island in the sea; only 海島 has the lighthouse and pier. */
  const island = board === "island" || board === "clover";
  const clover = board === "clover";
  const ENV_R = clover ? 5.7 : ISLAND_R;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let speed = 1;
  const pace = () => speed * (reduceMotion ? 10 : 1);

  // ---------- Renderer, scene, light ----------
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: seeThrough });
  if (seeThrough) renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = seeThrough ? 0.9 : clover ? 1.0 : island ? 1.1 : 0.85; // the forest board: deeper, richer greens
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new T.Scene();
  // Add ?debug to the address to poke at the 3D scene from the browser console.
  if (/[?&]debug\b/.test(window.location.search)) (window as any).__board = { scene, T };
  const sky = document.createElement("canvas");
  sky.width = 4;
  sky.height = 256;
  const sg = sky.getContext("2d")!;
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  // 八字: a forest glade, deep green below, light filtering down from above.
  const skyStops = island ? ["#2f8fe0", "#6cc3f5", "#bfe9ff", "#fff3d6"] : ["#4b7a3c", "#2b4f2f", "#18311f", "#0b170f"];
  grad.addColorStop(0, skyStops[0]);
  grad.addColorStop(0.5, skyStops[1]);
  grad.addColorStop(0.85, skyStops[2]);
  grad.addColorStop(1, skyStops[3]);
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new T.CanvasTexture(sky);
  skyTex.encoding = T.sRGBEncoding;
  scene.background = seeThrough ? null : skyTex;
  scene.fog = seeThrough ? null : new T.Fog(island ? 0xa9dcf5 : 0x16291c, island ? 50 : 40, island ? 110 : 140);

  const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(island ? new T.HemisphereLight(0xfff1e0, 0x5b3b7a, 0.85) : new T.HemisphereLight(0xe2f5cf, 0x14240f, 0.7));
  const sun = new T.DirectionalLight(island ? 0xffe2c2 : 0xffe8b5, island ? 1.15 : 1.3);
  sun.position.set(-10, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const mat = (color: number, rough = 0.35, extra: object = {}) =>
    new T.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra));
  /** 三葉草: true-to-the-picture colours (sRGB → linear), so the grass, sand and gold read rich instead of washed out. */
  const matC = (color: number, rough = 0.35, extra: object = {}) => {
    const m = mat(color, rough, extra);
    if (clover) m.color.convertSRGBToLinear();
    return m;
  };
  const shadowy = (mesh: any) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const Y = new T.Vector3(0, 1, 0);
  const toLocal = (v: any, yaw = TURN) => v.clone().applyAxisAngle(Y, -yaw);

  // 海島: water and a sand deck. 八字: no deck at all — every square floats on its own over a misty
  // forest floor far below, with the two monsters' islands in the middle of the diamonds.
  // 公開桌 (Sky 2026-10-03): every island is a crystal-planet island — the painted crystal rock hangs
  // underneath, and the big ones (monsters, gate, treasure) wear the painted crystal floor on top.
  const crystal = !island;
  const paint = (url: string) => {
    const t = new T.TextureLoader().load(url);
    t.encoding = T.sRGBEncoding;
    return t;
  };
  const crystalFloor = crystal ? paint("/art/city/crystal/top.webp") : null;
  if (crystalFloor) {
    crystalFloor.repeat.set(0.96, 0.96);
    crystalFloor.offset.set(0.02, 0.025);
  }
  const rockMats = new Map<number, any>();
  /** The painted rock, repeated (an even number of times, mirrored, so the seams meet) to suit the size. */
  const rockMat = (repeat: number) => {
    if (!rockMats.has(repeat)) {
      // Its own load per repeat count (a clone made before the picture arrives would never show it).
      const t = paint("/art/city/crystal/side.webp");
      t.wrapS = T.MirroredRepeatWrapping;
      t.repeat.set(repeat, 1);
      rockMats.set(repeat, new T.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.04, side: T.DoubleSide }));
    }
    return rockMats.get(repeat);
  };
  const islandMesh = (size: number, seed: number, top: number, floor = false) => {
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
    if (crystal) {
      const trim = new T.MeshStandardMaterial({ color: 0xa99ad6, roughness: 0.8 });
      const grass = floor
        ? shadowy(new T.Mesh(new T.CylinderGeometry(0.5 * size, 0.52 * size, 0.14, 48), [trim, new T.MeshStandardMaterial({ map: crystalFloor, color: 0xc4c4c4, roughness: 1 }), trim]))
        : shadowy(new T.Mesh(rough(new T.CylinderGeometry(0.5 * size, 0.53 * size, 0.14, 8), 0.04 * size), mat(top, 0.7)));
      grass.position.y = TOP - 0.07;
      g.add(grass);
      const H = 0.85 * size;
      const repeat = 2 * Math.max(1, Math.round((Math.PI * size) / 6));
      const under = new T.Mesh(new T.CylinderGeometry(0.52 * size, 0.34 * size, H, floor ? 48 : 16, 1, true), rockMat(repeat));
      under.position.y = TOP - 0.14 - H / 2;
      g.add(under);
      const coreH = 0.6 * size;
      const core = new T.Mesh(new T.CylinderGeometry(0.48 * size, 0.16 * size, coreH, floor ? 32 : 10, 1, true), new T.MeshBasicMaterial({ color: 0x4a4266 }));
      core.position.y = TOP - 0.14 - coreH / 2;
      g.add(core);
      return { group: g, top: grass };
    }
    const grass = shadowy(new T.Mesh(rough(new T.CylinderGeometry(0.5 * size, 0.53 * size, 0.14, 8), 0.04 * size), mat(top, 0.7)));
    grass.position.y = TOP - 0.07;
    g.add(grass);
    const dirt = shadowy(new T.Mesh(rough(new T.CylinderGeometry(0.53 * size, 0.44 * size, 0.2, 8), 0.05 * size), flat(0x7a5230)));
    dirt.position.y = TOP - 0.24;
    g.add(dirt);
    // Like the single-player board (Sky 2026-10-01): a stubby round rock under the soil, not a spike.
    const rockH = 0.42 * size;
    const rock = shadowy(new T.Mesh(rough(new T.CylinderGeometry(0.46 * size, 0.38 * size, rockH, 9, 2), 0.06 * size), flat(0x5d6168)));
    rock.position.y = TOP - 0.34 - rockH / 2;
    g.add(rock);
    const cap = shadowy(new T.Mesh(rough(new T.SphereGeometry(0.38 * size, 9, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0.05 * size), flat(0x565a61)));
    cap.scale.y = 0.55;
    cap.position.y = TOP - 0.34 - rockH;
    g.add(cap);
    return { group: g, top: grass };
  };
  /** 火龍: the left diamond's monster, a fat red dragon that breathes fireballs. */
  function makeDragon() {
    const group = new T.Group();
    const red = mat(0xd9432b, 0.55), belly = mat(0xf7c46c, 0.6), horn = mat(0xf3ead2, 0.5);
    const body = shadowy(new T.Mesh(new T.SphereGeometry(0.75, 24, 18), red));
    body.scale.set(1, 1.1, 0.9);
    body.position.y = 0.8;
    group.add(body);
    const tummy = shadowy(new T.Mesh(new T.SphereGeometry(0.55, 20, 14), belly));
    tummy.scale.set(1, 1.2, 0.5);
    tummy.position.set(0, 0.72, 0.42);
    group.add(tummy);
    const head = new T.Group();
    head.position.set(0, 1.85, 0.1);
    group.add(head);
    const skull = shadowy(new T.Mesh(new T.SphereGeometry(0.5, 22, 16), red));
    head.add(skull);
    const snout = shadowy(new T.Mesh(new T.SphereGeometry(0.3, 18, 12), red));
    snout.scale.set(1.2, 0.8, 1);
    snout.position.set(0, -0.12, 0.4);
    head.add(snout);
    for (const s of [-1, 1]) {
      const h = shadowy(new T.Mesh(new T.ConeGeometry(0.1, 0.45, 10), horn));
      h.position.set(s * 0.28, 0.45, -0.05);
      h.rotation.z = -s * 0.35;
      head.add(h);
      const eye = new T.Mesh(new T.SphereGeometry(0.1, 14, 10), new T.MeshBasicMaterial({ color: 0xffe066 }));
      eye.position.set(s * 0.2, 0.12, 0.4);
      head.add(eye);
      const pupil = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), new T.MeshBasicMaterial({ color: 0x1b1b1b }));
      pupil.position.set(s * 0.2, 0.12, 0.49);
      head.add(pupil);
      const wing = shadowy(new T.Mesh(new T.ConeGeometry(0.45, 0.9, 3), mat(0xa8321f, 0.6)));
      wing.position.set(s * 0.8, 1.25, -0.25);
      wing.rotation.set(0.3, 0, -s * 1.1);
      group.add(wing);
      const foot = shadowy(new T.Mesh(new T.SphereGeometry(0.22, 14, 10), red));
      foot.scale.set(1, 0.6, 1.3);
      foot.position.set(s * 0.4, 0.1, 0.2);
      group.add(foot);
    }
    const tail = shadowy(new T.Mesh(new T.ConeGeometry(0.22, 1.1, 12), red));
    tail.position.set(0.3, 0.35, -0.8);
    tail.rotation.set(-1.2, 0, 0.4);
    group.add(tail);
    const mouth = new T.Object3D();
    mouth.position.set(0, -0.15, 0.75);
    head.add(mouth);
    return { group, head, mouth, phase: 0 };
  }
  /**
   * Sky's drawn monsters (2026-10-01) in place of the shape-built ones: a picture standing on its island that
   * always faces the camera. `mouth` is where the shot leaves the picture (0–1 across, 0–1 down).
   */
  function makePictureMonster(url: string, size: number, mouth: [number, number], model?: { url: string; height: number; mouth: [number, number] }) {
    const group = new T.Group();
    const tex = new T.TextureLoader().load(url);
    tex.encoding = T.sRGBEncoding;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
    sprite.center.set(0.5, 0);
    sprite.scale.set(size, size, 1);
    group.add(sprite);
    // A soft shadow on the ground under its feet, so it stands on the island instead of floating over it.
    const foot = new T.Mesh(new T.PlaneGeometry(size * 0.75, size * 0.42), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }));
    foot.rotation.x = -Math.PI / 2;
    foot.position.y = 0.02;
    group.add(foot);
    const head = new T.Object3D();
    group.add(head);
    const spot = new T.Object3D();
    spot.position.set((mouth[0] - 0.5) * size, (1 - mouth[1]) * size, 0.2);
    group.add(spot);
    const made = { group, head, mouth: spot, phase: 0, flat: true };
    // The real 3D model (Meshy, from Sky's picture) takes over once it has loaded; the picture stands in till then.
    if (model) {
      loadGltfLoader(T)
        .then((Loader) => new Promise<any>((resolve, reject) => new Loader().load(model.url, resolve, undefined, reject)))
        .then((gltf) => {
          const body = gltf.scene;
          body.traverse((o: any) => {
            if (!o.isMesh) return;
            o.castShadow = true;
            o.receiveShadow = true;
            o.material.metalness = 0;
            o.material.roughness = Math.max(0.6, o.material.roughness ?? 0.6);
          });
          const box = new T.Box3().setFromObject(body);
          const k = model.height / (box.max.y - box.min.y);
          body.scale.setScalar(k);
          body.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
          // The model lives inside `head`, so the idle moves (look about, hop, roar) turn and lift the whole body.
          head.add(body);
          sprite.visible = false;
          spot.position.set(0, model.height * model.mouth[0], ((box.max.z - box.min.z) / 2) * k * model.mouth[1]);
          made.flat = false;
        })
        .catch(() => {
          // Keep the picture.
        });
    }
    return made;
  }
  /** 炮石怪: the right diamond's monster, a mossy stone golem with a cannon in its chest. */
  function makeGolem() {
    const group = new T.Group();
    const stone = new T.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.9, flatShading: true });
    const moss = new T.MeshStandardMaterial({ color: 0x5c9e3a, roughness: 0.9, flatShading: true });
    const body = shadowy(new T.Mesh(new T.DodecahedronGeometry(0.8, 0), stone));
    body.scale.set(1.1, 1, 0.9);
    body.position.y = 0.95;
    group.add(body);
    const cap = shadowy(new T.Mesh(new T.DodecahedronGeometry(0.55, 0), moss));
    cap.scale.set(1.3, 0.35, 1.1);
    cap.position.y = 1.65;
    group.add(cap);
    const head = new T.Group();
    head.position.set(0, 1.95, 0.05);
    group.add(head);
    const skull = shadowy(new T.Mesh(new T.DodecahedronGeometry(0.42, 0), stone));
    head.add(skull);
    for (const s of [-1, 1]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.08, 12, 8), new T.MeshBasicMaterial({ color: 0x5ff5ff }));
      eye.position.set(s * 0.16, 0.05, 0.36);
      head.add(eye);
      const arm = shadowy(new T.Mesh(new T.DodecahedronGeometry(0.32, 0), stone));
      arm.scale.set(0.8, 1.4, 0.8);
      arm.position.set(s * 0.95, 0.75, 0.1);
      group.add(arm);
      const fist = shadowy(new T.Mesh(new T.DodecahedronGeometry(0.28, 0), stone));
      fist.position.set(s * 1.0, 0.25, 0.2);
      group.add(fist);
    }
    // The cannon: a dark barrel sticking out of its chest.
    const barrel = shadowy(new T.Mesh(new T.CylinderGeometry(0.2, 0.26, 0.7, 16), mat(0x2b2f36, 0.4, { metalness: 0.5 })));
    barrel.rotation.x = Math.PI / 2 - 0.25;
    barrel.position.set(0, 1.0, 0.75);
    group.add(barrel);
    const ring = shadowy(new T.Mesh(new T.TorusGeometry(0.22, 0.05, 8, 16), mat(0xfbd000, 0.3, { metalness: 0.6 })));
    ring.position.set(0, 1.08, 1.08);
    ring.rotation.x = -0.25;
    group.add(ring);
    const mouth = new T.Object3D();
    mouth.position.set(0, 1.12, 1.15);
    group.add(mouth);
    return { group, head, mouth, phase: 1.3 };
  }
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(160,255,200,0.9)");
    g.addColorStop(1, "rgba(160,255,200,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const FLOOR = island ? -0.9 : -2.6;
  const far = new T.Group();
  scene.add(far);
  /** Every floating thing breathes: its own period and start, so they never move together. */
  const breathers: { obj: any; base: number; phase: number; period: number; shadow?: any; glow?: any; key?: string }[] = [];
  const bobOf = (key: string) => bobs.get(key) ?? 0;
  const bobs = new Map<string, number>();
  let deckMat: any = null;
  let motes: any = null;
  /** The outer-space backdrop (八字 board). */
  let space: Backdrop | null = null;
  /** The two monsters, one in the middle of each diamond (八字 board only). */
  /** The crystal gate in the top notch (lightning plays round it). */
  let gate: any = null;
  const monsters: Partial<Record<"left" | "right", { group: any; head: any; mouth: any; phase: number; flat?: boolean }>> = {};
  if (island) {
    // Floating in space (Sky 2026-10-01): a thin ring of sea round the sand, and rock hanging underneath. In a
    // game the galaxy picture fills the sky; in the 領地 preview the page's own background shows through.
    if (!seeThrough) space = createSpace(T, scene, camera, { reduceMotion, picture: GALAXY_SPACE, extras: false, far: 180, meteor: true });
    const sea = new T.Mesh(new T.CylinderGeometry(ENV_R + 3.1, ENV_R + 2.9, 0.5, 48), matC(0x2bb3c9, 0.25, { metalness: 0.2 }));
    sea.position.y = -0.95;
    scene.add(sea);
    const rock = new T.Mesh(new T.ConeGeometry(ENV_R + 3, 5.5, 12, 3), new T.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95, flatShading: true }));
    rock.rotation.x = Math.PI;
    rock.position.y = -1.2 - 2.75;
    scene.add(rock);
    const deck = shadowy(new T.Mesh(new T.CylinderGeometry(ENV_R + 1.7, ENV_R + 2.3, 1, 48), matC(clover ? 0x8fd16a : 0xf2d9a0, 0.9)));
    deck.position.y = -0.5;
    deckMat = deck.material;
    scene.add(deck);
    const grass = shadowy(new T.Mesh(new T.CylinderGeometry(ENV_R - 0.8, ENV_R - 0.6, 0.12, 40), matC(0x5fae4a, 0.8)));
    grass.position.y = 0.02;
    // 三葉草 has each loop's own ground instead of one lawn.
    if (!clover) scene.add(grass);
  } else {
    // Outer space all round (the public table's own picture), in place of the old forest floor.
    space = createSpace(T, scene, camera, { reduceMotion, picture: TABLE_SPACE, extras: false, far: 180, meteor: true });
    // Motes of stardust drifting up.
    const count = 200, pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 24;
      pos[i * 3 + 1] = FLOOR + 0.5 + Math.random() * 7;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    motes = new T.Points(geo, new T.PointsMaterial({ size: 0.12, map: glowTex, color: 0xdfe6ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    scene.add(motes);
    // The monsters' two big islands, with a few trees round the edge.
    for (const x of [-D, D]) {
      const big = islandMesh(3.4, x < 0 ? 901 : 902, 0x4f9e34, true);
      big.group.position.set(x, -0.3, 0);
      scene.add(big.group);
      breathers.push({ obj: big.group, base: -0.3, phase: x < 0 ? 0 : 2, period: 5.5 });
      // No trees round the monsters any more (Sky 2026-10-01).
      for (let k = 0; k < 0; k++) {
        const a = k * 1.6 + (x < 0 ? 0.4 : 2), r = 1.25;
        const trunk = shadowy(new T.Mesh(new T.CylinderGeometry(0.06, 0.09, 0.5, 6), mat(0x6b4423, 0.8)));
        trunk.position.set(Math.cos(a) * r, TOP + 0.22, Math.sin(a) * r);
        const crown = shadowy(new T.Mesh(new T.IcosahedronGeometry(0.34, 0), new T.MeshStandardMaterial({ color: k % 2 ? 0x4fa83a : 0x3d8f2e, flatShading: true })));
        crown.position.set(trunk.position.x, TOP + 0.62, trunk.position.z);
        big.group.add(trunk, crown);
      }
      const side = x < 0 ? "left" : "right";
      const m =
        side === "left"
          ? makePictureMonster("/art/fx/monster-dragon.webp", 3.4, [0.6, 0.38], { url: "/models/monster-dragon.glb", height: 2.7, mouth: [0.72, 0.9] })
          : makePictureMonster("/art/fx/monster-golem.webp", 3.4, [0.73, 0.36], { url: "/models/monster-golem.glb", height: 2.8, mouth: [0.6, 1.1] });
      void makeDragon;
      void makeGolem;
      m.group.position.set(0, TOP, 0.35);
      big.group.add(m.group);
      monsters[side] = m;
    }
  }

  // ---------- Tiles ----------
  type Tile = { group: any; body: any; base: number; inward: any; house: any; yaw: number; pic?: any };
  const tiles: Record<string, Tile> = {};
  const floaters: { obj: any; base?: number; spin?: boolean; bat?: number }[] = [];
  /** Power cards hovering over their squares, by square. */
  const cards = new Map<string, any>();

  function decorate(kind: string, group: any, yaw: number) {
    if (kind === "start") {
      const arrow = new T.Shape();
      arrow.moveTo(0, 0.5); arrow.lineTo(0.4, 0.04); arrow.lineTo(0.15, 0.04); arrow.lineTo(0.15, -0.45);
      arrow.lineTo(-0.15, -0.45); arrow.lineTo(-0.15, 0.04); arrow.lineTo(-0.4, 0.04); arrow.closePath();
      const g = new T.ExtrudeGeometry(arrow, { depth: 0.09, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const a = shadowy(new T.Mesh(g, mat(0xe52521)));
      a.position.y = TOP;
      const [ax, az] = layout.spotPoint({ on: "loop", i: 0 }), [bx, bz] = layout.spotPoint({ on: "loop", i: 1 });
      const dir = toLocal(new T.Vector3(bx - ax, 0, bz - az), yaw);
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
    if (kind === "dock") {
      const boat = new T.Group();
      const hull = shadowy(new T.Mesh(new T.BoxGeometry(0.8, 0.18, 0.36), mat(0x9a5b2e, 0.6)));
      hull.position.y = 0.09;
      boat.add(hull);
      const mast = shadowy(new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.6, 8), mat(0x7c4a1e, 0.6)));
      mast.position.y = 0.45;
      boat.add(mast);
      const sail = shadowy(new T.Mesh(new T.ConeGeometry(0.22, 0.45, 3), mat(0xffffff, 0.5)));
      sail.position.set(0.1, 0.5, 0);
      boat.add(sail);
      boat.position.y = TOP;
      group.add(boat);
      floaters.push({ obj: boat, base: TOP, spin: false });
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

  /** Painted tile pictures by square kind (public table). */
  const TILE_ART: Record<string, string> = { chance: "/art/tiles/crystal/chance.webp", chest: "/art/tiles/crystal/chest.webp", start: "/art/tiles/crystal/start.webp",
    tax: "/art/tiles/crystal/tax.webp", jail: "/art/tiles/crystal/jail.webp", fly: "/art/tiles/crystal/fly.webp", lot: "/art/tiles/crystal/lot.webp", cross: "/art/tiles/crystal/cross.webp" };
  /** The painted tile's own colour when nobody owns it; an owner tints it toward their colour. */
  const PIC_WHITE = 0xeeeeee;
  const tilePics = new Map<string, any>();
  const tilePic = (url: string) => {
    if (!tilePics.has(url)) {
      const t = new T.TextureLoader().load(url);
      t.encoding = T.sRGBEncoding;
      t.anisotropy = 4;
      tilePics.set(url, t);
    }
    return tilePics.get(url);
  };
  const PLAIN: Record<string, number> = {
    start: 0xfbd000, jail: 0x64748b, chest: 0xf2c230, fly: 0x38bdf8, dock: 0x38bdf8, chance: 0x8b5cf6, tax: 0x334155, fork: 0xffffff, cross: 0xff7a59,
  };
  /** 三葉草 tile pictures: Sky's material art where there is some, an emoji for the rest until drawn. */
  const CLOVER_ART: Record<string, string> = {
    wood: "/art/realm/wood.webp",
    stone: "/art/realm/stone.webp",
    gold: "/art/realm/gold.webp",
    ...Object.fromEntries(["plaza", "toll", "map", "artisan", "caravan", "termite", "landslide", "bandit", "sand"].map((k) => [k, `/art/tiles/clover/${k}.webp`])),
  };
  const CLOVER_EMOJI: Record<string, string> = {
    plaza: "🏰", toll: "🚧", map: "🗺️", artisan: "🔨", caravan: "🐫", termite: "🐜", landslide: "⛰️", bandit: "🥷", sand: "🌀",
  };
  /** Each loop's ground: forest grass, quarry sand, mine gold; the plaza is warm paving. Penalty squares get a red ring. */
  const ZONE_GROUND = [0x6cc04a, 0xe6c98f, 0xf2c75c];
  const BAD = new Set(["termite", "landslide", "bandit", "sand", "toll"]);
  const emojiPics = new Map<string, any>();
  const emojiPic = (emoji: string) => {
    if (!emojiPics.has(emoji)) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const x = c.getContext("2d")!;
      x.font = "170px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(emoji, 128, 140);
      const t = new T.CanvasTexture(c);
      t.encoding = T.sRGBEncoding;
      emojiPics.set(emoji, t);
    }
    return emojiPics.get(emoji);
  };
  function makeCloverTile(key: string, x: number, z: number) {
    const square = BOARDS[board].squares[key];
    const plaza = square.kind === "plaza";
    const size = plaza ? 2.2 : 1.3 * ISLE;
    const group = new T.Group();
    group.position.set(x, 0, z);
    scene.add(group);
    // A round pad on the sand — grass, sand or gold ground by loop, no rock (Sky: 唔好再係石頭).
    const base = plaza ? 0xf4e2b8 : ZONE_GROUND[square.group % 3];
    const pad = shadowy(new T.Mesh(new T.CylinderGeometry(size / 2, size / 2 + 0.06, 0.26, 40), matC(base, 0.85)));
    pad.position.y = TOP - 0.13;
    pad.receiveShadow = true;
    group.add(pad);
    const ring = shadowy(new T.Mesh(new T.TorusGeometry(size / 2, 0.05, 8, 40), matC(plaza ? 0xd4a72c : BAD.has(square.kind) ? 0xe5484d : 0xffffff, 0.4)));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = TOP + 0.005;
    group.add(ring);
    const picSize = size * (plaza ? 0.95 : 0.85);
    const pic = new T.Mesh(
      new T.PlaneGeometry(picSize, picSize),
      new T.MeshBasicMaterial({ map: CLOVER_ART[square.kind] ? tilePic(CLOVER_ART[square.kind]) : emojiPic(CLOVER_EMOJI[square.kind] ?? "❔"), transparent: true, alphaTest: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    pic.rotation.x = -Math.PI / 2;
    pic.position.y = TOP + 0.01;
    pic.renderOrder = 2;
    if (plaza) {
      // Sky (2026-10-08): the castle stands up at the back of the plaza (a picture facing the camera, like the
      // statues), on its own little floating rock, instead of lying flat on the ground.
      pic.visible = false;
      const castle = new T.Sprite(new T.SpriteMaterial({ map: tilePic(CLOVER_ART.plaza), transparent: true, alphaTest: 0.2 }));
      castle.center.set(0.5, 0.12);
      castle.scale.set(2.1, 2.1, 1);
      castle.position.set(0, TOP + 0.05, -0.55);
      group.add(castle);
      const rock = shadowy(new T.Mesh(new T.ConeGeometry(size / 2 + 0.05, 1.6, 9, 2), matC(0x8a7f74, 0.95, { flatShading: true })));
      rock.rotation.x = Math.PI;
      rock.position.y = TOP - 0.26 - 0.8;
      group.add(rock);
      pad.material = matC(0x6cc04a, 0.85);
      group.position.y = 0.35;
    }
    group.add(pic);
    const shadow = new T.Mesh(new T.PlaneGeometry(1.7 * ISLE, 1.7 * ISLE), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.visible = false;
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xfff1b0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
    breathers.push({ obj: group, base: plaza ? 0.35 : 0, phase: Math.random() * Math.PI * 2, period: 3.2 + Math.random() * 1.2, shadow, glow, key });
    const holder = new T.Group();
    group.add(holder);
    tiles[key] = { group, body: pad, base, inward: new T.Vector3(0, 0, -0.27), house: null, yaw: 0 };
  }
  function makeTile(key: string, x: number, z: number, outward: any, yaw: number) {
    if (clover) return makeCloverTile(key, x, z);
    const square = BOARDS[board].squares[key];
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    // Grass on top for lots; the special squares keep their colour so they're easy to spot.
    // Lots are bare grey stones like the single-player board (Sky 2026-10-01), each a slightly different grey;
    // the special squares keep their colour so they're easy to spot.
    // On the crystal islands (public table) the lots are pale crystal stone instead of grey.
    const stones = crystal ? [0xc9c0e6, 0xd2c9ee, 0xc1b7df, 0xd8d0f1] : [0x9a958c, 0xa39e94, 0x8f8a82, 0xaaa59a];
    // Sky's painted tiles (2026-10-03): the picture lies on the square's top instead of the little 3D sign.
    const art = crystal ? TILE_ART[square.kind] : undefined;
    const base = art && square.kind !== "lot" ? 0x3d2c78 : square.kind === "lot" ? (square.gold ? 0xd6c24a : stones[Object.keys(tiles).length % 4]) : PLAIN[square.kind];
    const big = ["start", "jail", "chest", "fly", "dock", "cross"].includes(square.kind);
    const isle = islandMesh((big ? 1.36 : 1.08) * ISLE, 100 + Object.keys(tiles).length * 17, base);
    group.add(isle.group);
    const body = isle.top;
    body.material = new T.MeshStandardMaterial({ color: base, roughness: 0.95, flatShading: true });
    // Its shadow on the floor far below, and a soft glow under the rock.
    const shadow = new T.Mesh(new T.PlaneGeometry(1.7 * ISLE, 1.7 * ISLE), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, FLOOR + 0.02, z);
    shadow.visible = island; // nothing below to cast on in space
    scene.add(shadow);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: square.kind === "start" ? 0x6fe3ff : crystal ? 0xc9a6ff : 0x9dffb0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.5 }));
    glow.scale.set(1.4 * ISLE, 0.9, 1);
    glow.position.set(x, TOP - 1.2, z);
    scene.add(glow);
    breathers.push({ obj: group, base: 0, phase: Math.random() * Math.PI * 2, period: 3.2 + Math.random() * 1.2, shadow, glow, key });
    // Buildings stand at the back of the square (away from the camera), tokens at the front.
    const tile: Tile = { group, body, base, inward: toLocal(new T.Vector3(0, 0, -0.27), yaw), house: null, yaw };
    tiles[key] = tile;
    if (square.kind === "lot" && outward) {
      const o = toLocal(outward, yaw);
      const ox = Math.round(o.x), oz = Math.round(o.z);
      const band = shadowy(new T.Mesh(new T.BoxGeometry(ox ? 0.26 : 0.9, 0.07, oz ? 0.26 : 0.9), mat(GROUP_COLOURS[square.group % 8], 0.4)));
      band.position.set(ox * 0.34, TOP + 0.02, oz * 0.34);
      group.add(band);
    }
    if (square.gold) {
      const gem = shadowy(new T.Mesh(new T.OctahedronGeometry(0.12), mat(0xfbd000, 0.15, { metalness: 0.6, emissive: 0x5a3d00 })));
      gem.position.set(0.3, TOP + 0.12, 0.3);
      group.add(gem);
    }
    // Big square decorations (chest, jail, plane …) sit smaller at the back of the square too, so the
    // players standing at the front are never hidden behind them.
    const holder = new T.Group();
    holder.position.copy(toLocal(new T.Vector3(0, 0, -0.3), yaw)).setY(TOP * 0.3); // keeps its base on the tile top
    holder.scale.setScalar(0.7);
    group.add(holder);
    if (art) {
      const size = (big ? 1.36 : 1.08) * ISLE * 0.98;
      const pic = new T.Mesh(
        new T.PlaneGeometry(size, size),
        new T.MeshStandardMaterial({ map: tilePic(art), color: PIC_WHITE, roughness: 0.9, transparent: true, alphaTest: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      pic.rotation.x = -Math.PI / 2;
      pic.receiveShadow = true;
      // Upright to the camera; the start arrow points the way round instead.
      let turn = 0;
      if (square.kind === "start") {
        const [ax, az] = layout.spotPoint({ on: "loop", i: 0 }), [bx, bz] = layout.spotPoint({ on: "loop", i: 1 });
        turn = Math.atan2(-(bx - ax), -(bz - az));
      }
      const flat = new T.Group();
      flat.rotation.y = -yaw + turn;
      flat.position.y = TOP + 0.004;
      flat.add(pic);
      group.add(flat);
      tile.pic = pic.material;
    } else {
      decorate(square.kind, holder, yaw);
    }
  }
  for (const plan of layout.tiles) {
    makeTile(plan.key, plan.x, plan.z, plan.outward ? new T.Vector3(plan.outward[0], 0, plan.outward[1]) : null, plan.yaw);
  }
  // ---------- Castle in the top notch, treasure in the bottom one ----------
  const castleZ = layout.hub[2];
  const roof = mat(0xc0264b, 0.4);
  if (clover) {
    // Each loop sits on its own ground — forest green, quarry pale sand, mine gold — so the clover reads at a glance,
    // and a plank path runs along each loop from square to square.
    const ZONES = [0x8f8a82, 0x2f8a32, 0x5b4630];
    for (let z = 0; z < 3; z++) {
      const pts = Array.from({ length: CLOVER_PETAL }, (_, k) => CLOVER_POINTS[`o${z * CLOVER_PETAL + k + 1}`]);
      const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cz = pts.reduce((t, p) => t + p[1], 0) / pts.length;
      const rx = Math.max(...pts.map((p) => Math.abs(p[0] - cx))) + 1.1, rz = Math.max(...pts.map((p) => Math.abs(p[1] - cz))) + 1.1;
      const blob = new T.Mesh(new T.CircleGeometry(1, 48), matC(ZONES[z], 0.9));
      blob.rotation.x = -Math.PI / 2;
      blob.scale.set(rx, rz, 1);
      blob.position.set(cx, 0.085, cz);
      blob.receiveShadow = true;
      scene.add(blob);
    }
    // One plank path from the castle round all eighteen squares and back.
    const keys = Array.from({ length: CLOVER_LOOP + 1 }, (_, k) => `o${k % CLOVER_LOOP}`);
    for (let k = 0; k < keys.length - 1; k++) {
      const [ax, az] = CLOVER_POINTS[keys[k]], [bx, bz] = CLOVER_POINTS[keys[k + 1]];
      const len = Math.hypot(bx - ax, bz - az);
      for (let n = 0; n < Math.round(len / 0.32); n++) {
        const t = (n + 0.5) / Math.round(len / 0.32);
        const plank = shadowy(new T.Mesh(new T.BoxGeometry(0.62, 0.05, 0.22), mat(n % 2 ? 0xb07a45 : 0x9a6a3a, 0.85)));
        plank.position.set(ax + (bx - ax) * t, 0.11, az + (bz - az) * t);
        plank.rotation.y = Math.atan2(bx - ax, bz - az);
        scene.add(plank);
      }
    }
    // 三葉草: palms in the gaps between the loops (the plaza's castle picture carries its own flag).
    for (let n = 0; n < 6; n++) {
      const [px, pz] = ([[0, -1.6], [-3.6, 4.6], [3.6, 4.6], [-4.6, -4.2], [4.6, -4.2], [0, 1.6]] as const)[n];
      const palm = new T.Group();
      for (let k = 0; k < 5; k++) {
        const seg = shadowy(new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 0.36, 8), matC(0x9a6a3a, 0.8)));
        seg.position.set(k * 0.04, 0.18 + k * 0.34, 0);
        palm.add(seg);
      }
      for (let k = 0; k < 6; k++) {
        const leaf = shadowy(new T.Mesh(new T.ConeGeometry(0.16, 0.9, 4), matC(0x2e9e44, 0.6)));
        const hold = new T.Group();
        hold.position.set(0.2, 1.75, 0);
        hold.rotation.y = (k / 6) * Math.PI * 2;
        leaf.rotation.set(0, 0, -1.25);
        leaf.position.x = 0.4;
        hold.add(leaf);
        palm.add(hold);
      }
      palm.position.set(px, 0.05, pz);
      palm.scale.setScalar(n < 3 ? 0.85 : 0.7);
      scene.add(palm);
    }
  } else if (island) {
    // Lighthouse in the middle, palms around it, a pier out to sea by the dock square.
    const white = mat(0xffffff, 0.5), red = mat(0xe52521, 0.45), dark = mat(0x1f2937, 0.5);
    const tower = shadowy(new T.Mesh(new T.CylinderGeometry(0.42, 0.62, 3, 24), white));
    tower.position.y = 1.5;
    scene.add(tower);
    for (const y of [0.55, 1.45, 2.35]) {
      const band = shadowy(new T.Mesh(new T.CylinderGeometry(0.56 - y * 0.05, 0.6 - y * 0.05, 0.4, 24), red));
      band.position.y = y;
      scene.add(band);
    }
    const gallery = shadowy(new T.Mesh(new T.CylinderGeometry(0.62, 0.62, 0.1, 24), dark));
    gallery.position.y = 3.05;
    scene.add(gallery);
    const lamp = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 0.45, 16), new T.MeshBasicMaterial({ color: 0xfff3a0 }));
    lamp.position.y = 3.35;
    scene.add(lamp);
    const cap = shadowy(new T.Mesh(new T.ConeGeometry(0.5, 0.6, 24), roof));
    cap.position.y = 3.85;
    scene.add(cap);
    const beam = new T.Mesh(new T.ConeGeometry(0.5, 4, 16, 1, true), new T.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.25, side: T.DoubleSide, depthWrite: false }));
    beam.rotation.z = Math.PI / 2;
    beam.position.set(2, 0, 0);
    const beamPivot = new T.Group();
    beamPivot.position.y = 3.35;
    beamPivot.add(beam);
    scene.add(beamPivot);
    floaters.push({ obj: beamPivot, base: 3.35, spin: true });
    for (let n = 0; n < 4; n++) {
      const a = (n / 4) * Math.PI * 2 + 0.6, r = 1.9;
      const palm = new T.Group();
      for (let k = 0; k < 5; k++) {
        const seg = shadowy(new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 0.36, 8), mat(0x9a6a3a, 0.8)));
        seg.position.set(k * 0.04, 0.18 + k * 0.34, 0);
        palm.add(seg);
      }
      for (let k = 0; k < 6; k++) {
        const leaf = shadowy(new T.Mesh(new T.ConeGeometry(0.16, 0.9, 4), mat(0x2e9e44, 0.6)));
        leaf.position.set(0.2, 1.8, 0);
        leaf.rotation.set(0, (k / 6) * Math.PI * 2, 1.2);
        const hold = new T.Group();
        hold.position.set(0.2, 1.75, 0);
        leaf.position.set(0, 0, 0);
        hold.rotation.y = (k / 6) * Math.PI * 2;
        leaf.rotation.set(0, 0, -1.25);
        leaf.position.x = 0.4;
        hold.add(leaf);
        palm.add(hold);
      }
      palm.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      palm.scale.setScalar(0.8);
      scene.add(palm);
    }
    // Pier from the dock square (square 10, at the back) out over the water.
    const [px, pz] = layout.spotPoint({ on: "loop", i: 10 });
    const pier = new T.Group();
    for (let k = 0; k < 6; k++) {
      const plank = shadowy(new T.Mesh(new T.BoxGeometry(0.9, 0.08, 0.28), mat(0xb07a45, 0.8)));
      plank.position.set(0, -0.05, -0.9 - k * 0.32);
      pier.add(plank);
    }
    for (const x of [-0.4, 0.4]) {
      for (const z of [-1.2, -2.4]) {
        const post = shadowy(new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1, 8), mat(0x7c4a1e, 0.8)));
        post.position.set(x, -0.45, z);
        pier.add(post);
      }
    }
    const sailboat = new T.Group();
    const hull = shadowy(new T.Mesh(new T.BoxGeometry(1.2, 0.3, 0.5), mat(0xe52521, 0.5)));
    sailboat.add(hull);
    const mast = shadowy(new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.2, 8), mat(0x7c4a1e, 0.6)));
    mast.position.y = 0.7;
    sailboat.add(mast);
    const sail = shadowy(new T.Mesh(new T.ConeGeometry(0.4, 0.9, 3), mat(0xffffff, 0.5)));
    sail.position.set(0.18, 0.75, 0);
    sailboat.add(sail);
    sailboat.position.set(1, -0.7, -2.4);
    sailboat.rotation.y = Math.PI / 2;
    pier.add(sailboat);
    floaters.push({ obj: sailboat, base: -0.7, spin: false });
    pier.position.set(px, 0, pz);
    scene.add(pier);
  } else {
    const c = new T.Group();
    const stone = mat(0xd9cfe8, 0.7), dark = mat(0x5b3b7a, 0.5);
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
    // The castle has its own floating island in the top notch.
    const castleIsle = islandMesh(2.9, 903, 0x5aa83c, true);
    castleIsle.group.position.set(0, -0.2, castleZ);
    scene.add(castleIsle.group);
    breathers.push({ obj: castleIsle.group, base: -0.2, phase: 4, period: 6 });
    // Sky's drawn castle (2026-10-01) stands on the island instead of the shape-built one.
    void c;
    // Sky's 3D crystal gate (2026-10-01) stands where the castle was; nothing shows until it has loaded.
    const castlePic = makePictureMonster("/art/fx/castle.webp", 3.6, [0.5, 0.5], { url: "/models/crystal-gate.glb", height: 3.4, mouth: [0.5, 0] }).group;
    castlePic.children[0].visible = false;
    castlePic.position.set(0, TOP - 0.05, 0);
    castleIsle.group.add(castlePic);
    gate = castlePic;
    // Little gold stars circle the castle (Sky 2026-10-01: no black bats).
    const starShape = new T.Shape();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 0.09 : 0.22, t = (k / 10) * Math.PI * 2 + Math.PI / 2;
      if (k === 0) starShape.moveTo(Math.cos(t) * r, Math.sin(t) * r);
      else starShape.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    const starGeo = new T.ExtrudeGeometry(starShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    starGeo.center();
    const starMat = mat(0xffd23f, 0.3, { emissive: 0x8a5a00, metalness: 0.2 });
    // No stars round the gate any more (Sky 2026-10-01).
    for (let n = 0; n < 0; n++) {
      const bat = new T.Group();
      const star = new T.Mesh(starGeo, starMat);
      bat.add(star);
      const shine = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffe27a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.6 }));
      shine.scale.setScalar(0.7);
      bat.add(shine);
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
    pile.scale.setScalar(0.8);
    const pileIsle = islandMesh(2, 904, 0x5aa83c, true);
    pileIsle.group.position.set(0, -0.15, D - 0.7);
    scene.add(pileIsle.group);
    breathers.push({ obj: pileIsle.group, base: -0.15, phase: 1, period: 4.6 });
    void pile;
    // The chest is gone (Sky 2026-10-01); the island waits for something new.
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
  // Where everyone stands. Tokens sharing a square line up across its front half (the side
  // facing the camera), up to three in a row with a second row behind; buildings sit at the back,
  // so nobody is hidden behind one.
  const squareOf = (spot: Spot) => BOARDS[board].keyOf(spot);
  const spots: Spot[] = colours.map(() => ({ on: "loop", i: 0 }));
  const gone = new Set<number>();
  const sharing = (key: string) => spots.flatMap((s, seat) => (!gone.has(seat) && squareOf(s) === key ? [seat] : []));
  const place = (seat: number, spot: Spot) => {
    const [x, z] = layout.spotPoint(spot);
    const here = sharing(squareOf(spot));
    if (!here.includes(seat)) here.push(seat);
    here.sort((a, b) => a - b);
    const n = here.length, i = here.indexOf(seat);
    const front = Math.min(n, 3);
    const row = i < 3 ? 0 : 1;
    const inRow = row === 0 ? front : n - 3;
    const col = row === 0 ? i : i - 3;
    const ox = (col - (inRow - 1) / 2) * 0.3;
    const oz = n === 1 ? 0.14 : row === 0 ? 0.24 : -0.02;
    return new T.Vector3(x + ox, TOP, z + oz);
  };
  const tokens = colours.map((css, seat) => {
    const g = pawn(hex(css));
    g.position.copy(place(seat, spots[seat]));
    scene.add(g);
    return g;
  });
  /** Slide everyone else on a square into their places (someone arrived or left). */
  function settle(key: string, except: number) {
    for (const seat of sharing(key)) {
      if (seat === except) continue;
      const token = tokens[seat], at = spots[seat], from = token.position.clone(), to = place(seat, at);
      if (from.distanceTo(to) < 0.01) continue;
      // Stop sliding if this seat is moved meanwhile (a swap warps the other seat straight after, and
      // this slide used to drag it back to the square it had just left).
      void tween(220, (k) => {
        if (spots[seat] === at) token.position.lerpVectors(from, to, k);
      });
    }
  }
  /** When each seat last moved; a little after that, it turns round to face the camera. */
  const lastMoved: number[] = colours.map(() => 0);
  const face = (seat: number, target: any) => {
    const p = tokens[seat].position;
    tokens[seat].rotation.y = Math.atan2(target.x - p.x, target.z - p.z);
  };

  // ---------- 3D characters take over their seats' tokens ----------
  type Rig = { mixer: any; walk: any; cheer: any; special: any; idle: number };
  const rigs = new Map<number, Rig>();
  let disposed = false;
  (actors ?? []).forEach((key, seat) => {
    const actor = key ? ACTORS[key] : undefined;
    if (!actor || !tokens[seat]) return;
    loadGltfLoader(T)
      .then((Loader) => new Promise<any>((resolve, reject) => new Loader().load(actor.url, resolve, undefined, reject)))
      .then((gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.traverse((o: any) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
            // Painted cloth and skin, never metal (a metal body with nothing to reflect turns dark).
            o.material.metalness = 0;
            o.material.roughness = Math.max(0.6, o.material.roughness ?? 0.6);
          }
        });
        // Each skinned body stands 1.2 tall with its feet at 0; its bones carry the armature's
        // 0.01 scale, so a bounding box of the raw mesh would read it 100× too small.
        model.scale.setScalar(CHARACTER_HEIGHT / 1.2);
        const g = tokens[seat];
        g.children.forEach((c: any) => (c.visible = false));
        g.add(model);
        const mixer = new T.AnimationMixer(model);
        const clip = (name: string) => gltf.animations.find((a: any) => a.name === name);
        const walk = mixer.clipAction(clip("walk") ?? gltf.animations[0]);
        walk.timeScale = actor.walkPace;
        walk.play();
        walk.paused = true;
        const once = (name: string) => {
          const found = clip(name);
          if (!found) return null;
          const action = mixer.clipAction(found);
          action.setLoop(T.LoopOnce, 1);
          action.clampWhenFinished = true;
          return action;
        };
        const cheer = once("cheer"), special = once("special");
        // Back to standing when a cheer or special move ends.
        mixer.addEventListener("finished", (e: any) => {
          if (e.action !== cheer && e.action !== special) return;
          walk.reset();
          walk.timeScale = actor.walkPace;
          walk.play();
          walk.paused = true;
          e.action.crossFadeTo(walk, 0.3, false);
        });
        rigs.set(seat, { mixer, walk, cheer, special, idle: 0 });
      })
      .catch(() => {
        // Keep the pawn.
      });
  });
  /** Turn to face the player's camera, so a cheer or special move is seen from the front, not the back. */
  function turnToCamera(seat: number) {
    const token = tokens[seat];
    const from = token.rotation.y;
    const want = Math.atan2(camera.position.x - token.position.x, camera.position.z - token.position.z);
    // The short way round.
    const delta = ((want - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    void tween(250, (k) => (token.rotation.y = from + delta * k));
  }

  /** Walk while stepping; stand still (first frame of the walk) a moment after the last step. */
  function walking(seat: number, on: boolean) {
    const rig = rigs.get(seat);
    if (!rig) return;
    window.clearTimeout(rig.idle);
    if (on) {
      for (const move of [rig.cheer, rig.special]) {
        if (move && (move.isRunning() || move.getEffectiveWeight() > 0)) {
          move.stop();
          rig.walk.reset();
          rig.walk.play();
        }
      }
      rig.walk.paused = false;
      return;
    }
    rig.idle = window.setTimeout(() => {
      rig.walk.paused = true;
      rig.walk.time = 0;
    }, 200);
  }
  /** Play a one-off move (cheer or special) without holding up the game. */
  function perform(seat: number, which: "cheer" | "special") {
    const rig = rigs.get(seat);
    const move = rig?.[which];
    if (!rig || !move) return;
    window.clearTimeout(rig.idle);
    turnToCamera(seat);
    for (const other of [rig.cheer, rig.special]) if (other && other !== move) other.stop();
    move.reset();
    move.play();
    rig.walk.crossFadeTo(move, 0.25, false);
  }

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
  // Firework sparks and gold twinkles.
  const sparkGeo = new T.SphereGeometry(0.07, 6, 4);
  const starGeo = new T.OctahedronGeometry(0.09);
  const starMat = new T.MeshBasicMaterial({ color: 0xfff1a8 });
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

  // ---------- Camera: 40° down (海島 45°); close on the player, wide between turns ----------
  const ELEV = ((island ? 45 : 40) * Math.PI) / 180;
  /** The player can turn the board round (drag sideways) and tilt it (drag up and down) — 海島 only turns
   *  (Sky 2026-10-02: fixed at 45°, left and right only). */
  const view = { yaw: 0, elev: ELEV, goalYaw: 0, goalElev: ELEV, idle: 0 };
  const WIDE = { dist: layout.wide[2], target: new T.Vector3(layout.wideTarget[0], 0, layout.wideTarget[1]) };
  const CLOSE = 13;
  const cam = { target: WIDE.target.clone(), dist: WIDE.dist };
  const goal = { target: WIDE.target.clone(), dist: WIDE.dist, follow: -1 };
  let dragged = false;

  const canvas = renderer.domElement;
  const pointers = new Map<number, { x: number; y: number }>();
  const onDown = (e: PointerEvent) => {
    if (e.isPrimary) pointers.clear();
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
      // One finger (or the mouse): turn round the board and tilt it.
      view.goalYaw -= (e.clientX - before.x) * 0.006;
      if (!island) view.goalElev = Math.max(0.35, Math.min(1.35, view.goalElev + (e.clientY - before.y) * 0.004));
    } else {
      // Two fingers: pinch to zoom, move together to slide the board.
      dragged = true;
      const other = pts.find((p) => p !== before)!;
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (was > 1 && is > 1) goal.dist = cam.dist = Math.max(6, Math.min(60, cam.dist * (was / is)));
      const k = cam.dist / 1400, dx = (e.clientX - before.x) * k, dz = (e.clientY - before.y) * k;
      const c = Math.cos(view.yaw), s = Math.sin(view.yaw);
      goal.target.x = Math.max(-12, Math.min(12, goal.target.x - (dx * c + dz * s)));
      goal.target.z = Math.max(-12, Math.min(12, goal.target.z - (-dx * s + dz * c)));
      cam.target.copy(goal.target);
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
  canvas.addEventListener("lostpointercapture", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    WIDE.dist = w / h < 0.8 ? layout.wide[0] : w / h < 1.3 ? layout.wide[1] : layout.wide[2];
    if (goal.follow < 0) goal.dist = WIDE.dist;
    camera.updateProjectionMatrix();
  }
  const watch = new ResizeObserver(resize);
  watch.observe(container);
  resize();

  let frameId = 0;
  // ---------- 水晶門 lightning (Sky 2026-10-01): white bolts crackle round the crystal ring and across it ----------
  const bolts: { mesh: any; glow: any; born: number; life: number }[] = [];
  let nextBolt = 0;
  const boltMat = () => new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  function strike(now: number) {
    if (!gate) return;
    // The ring: about 1.15 across from its middle, which stands 1.45 above the island (the gate is 3.4 tall).
    const R = 1.15, CY = 1.45;
    const ring = (a: number, r = R) => new T.Vector3(Math.cos(a) * r, CY + Math.sin(a) * r * 1.15, (Math.random() - 0.5) * 0.3);
    const a0 = Math.random() * Math.PI * 2;
    const across = Math.random() < 0.35;
    const from = ring(a0, R * (0.9 + Math.random() * 0.25));
    const to = across ? ring(a0 + Math.PI + (Math.random() - 0.5) * 1.2, R * 0.9) : ring(a0 + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9), R * (0.95 + Math.random() * 0.3));
    // A jagged path: the straight line with random kinks, a little branch now and then.
    const points: any[] = [];
    const steps = across ? 9 : 7;
    for (let k = 0; k <= steps; k++) {
      const p = from.clone().lerp(to, k / steps);
      if (k > 0 && k < steps) p.add(new T.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.2));
      points.push(p);
    }
    const path = new T.CurvePath();
    for (let k = 0; k < points.length - 1; k++) path.add(new T.LineCurve3(points[k], points[k + 1]));
    const mesh = new T.Mesh(new T.TubeGeometry(path, points.length * 2, 0.035, 4, false), boltMat());
    gate.add(mesh);
    const glow = new T.Mesh(new T.TubeGeometry(path, points.length * 2, 0.12, 6, false), new T.MeshBasicMaterial({ color: 0xc9b6ff, transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending }));
    gate.add(glow);
    bolts.push({ mesh, glow, born: now, life: 140 + Math.random() * 160 });
  }
  function crackle(now: number) {
    if (!gate || reduceMotion) return;
    if (now > nextBolt) {
      strike(now);
      if (Math.random() < 0.4) strike(now);
      // Bursts: quick flickers, then a pause.
      nextBolt = now + (Math.random() < 0.6 ? 60 + Math.random() * 120 : 600 + Math.random() * 1400);
    }
    for (let n = bolts.length - 1; n >= 0; n--) {
      const b = bolts[n];
      const k = (now - b.born) / b.life;
      const flick = k < 1 ? (Math.random() < 0.25 ? 0.3 : 1) * (1 - k) : 0;
      b.mesh.material.opacity = flick;
      b.glow.material.opacity = 0.35 * flick;
      if (k >= 1) {
        gate.remove(b.mesh, b.glow);
        b.mesh.geometry.dispose();
        b.glow.geometry.dispose();
        b.mesh.material.dispose();
        b.glow.material.dispose();
        bolts.splice(n, 1);
      }
    }
  }
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    space?.update(now, dt);
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
      goal.target.set(p.x - Math.sin(view.yaw) * 0.6, 0, p.z - Math.cos(view.yaw) * 0.6);
    }
    rigs.forEach((rig) => rig.mixer.update(dt * speed));
    // Standing still: turn (smoothly) to face the camera, never back or side on.
    // Every island breathes up and down on its own clock; its shadow shrinks as it rises.
    if (!reduceMotion) {
      for (const b of breathers) {
        const h = Math.sin((now / 1000 / b.period) * Math.PI * 2 + b.phase) * 0.06;
        b.obj.position.y = b.base + h;
        if (b.key) bobs.set(b.key, h);
        if (b.shadow) {
          const sc = 1 - h * 1.5;
          b.shadow.scale.set(sc, sc, 1);
          b.shadow.material.opacity = 0.9 - h * 3;
        }
        if (b.glow) {
          b.glow.position.y = TOP - 1.2 + h;
          b.glow.material.opacity = 0.4 + Math.sin(now / 770 + b.phase) * 0.12;
        }
      }
      if (motes) {
        const p = motes.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          let y = p.getY(i) + dt * 0.18;
          if (y > 5) y = FLOOR + 0.5;
          p.setY(i, y);
          p.setX(i, p.getX(i) + Math.sin(now / 1600 + i) * dt * 0.08);
        }
        p.needsUpdate = true;
      }
    }
    crackle(now);
    // The monsters breathe and look about.
    for (const m of Object.values(monsters)) {
      if (!m || reduceMotion) continue;
      m.group.scale.y = 1 + Math.sin(now / 900 + m.phase) * 0.025;
      // Idle moves (Sky 2026-10-01), taking turns between the two monsters (half a cycle apart), one move per
      // cycle in rotation: a hop, a roar (stretch up tall and shake), a stomp (two heavy foot-falls).
      const cycle = 6000, clock = now + (m === monsters.right ? cycle / 2 : 0);
      const t = clock % cycle, move = Math.floor(clock / cycle) % 3;
      let lift = 0, squash = 0, tilt = 0, shake = 0;
      if (move === 0) {
        if (t < 250) squash = Math.sin((t / 250) * Math.PI) * 0.08;
        else if (t < 750) lift = Math.sin(((t - 250) / 500) * Math.PI) * 0.45;
        else if (t < 1300) tilt = Math.sin(((t - 750) / 550) * Math.PI * 3) * 0.12 * (1 - (t - 750) / 550);
      } else if (move === 1) {
        if (t < 300) squash = Math.sin((t / 300) * Math.PI) * 0.06;
        else if (t < 1400) {
          const k = (t - 300) / 1100;
          squash = -Math.sin(k * Math.PI) * 0.12;
          shake = Math.sin(t / 25) * 0.05 * Math.sin(k * Math.PI);
        }
      } else if (t < 1200) {
        const step = (t % 600) / 600;
        tilt = Math.sin(step * Math.PI) * 0.14 * (t < 600 ? 1 : -1);
        lift = Math.sin(step * Math.PI) * 0.12;
        if (step > 0.85) squash = 0.06;
      }
      m.head.position.set(shake, lift, 0);
      m.head.scale.set(1 + squash, 1 - squash, 1 + squash);
      m.head.rotation.z = tilt;
      // Keep an eye on the players: turn towards whoever moved last (Sky 2026-10-01).
      let watch = -1;
      lastMoved.forEach((when, seat) => {
        if (!gone.has(seat) && (watch < 0 || when > lastMoved[watch])) watch = seat;
      });
      if (watch >= 0 && tokens[watch]) {
        const at = m.group.getWorldPosition(new T.Vector3());
        const to = tokens[watch].position;
        const want = Math.atan2(to.x - at.x, to.z - at.z) - m.group.rotation.y;
        const delta = ((want - m.head.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        m.head.rotation.y += delta * Math.min(1, dt * 2.5);
      }
    }
    // Parallax: the far scenery follows the camera part of the way, so it seems to drift slower.
    far.position.x = camera.position.x * 0.45;
    const clock = performance.now();
    tokens.forEach((token, seat) => {
      // Standing players ride their island up and down.
      if (!gone.has(seat) && clock - lastMoved[seat] >= 250) token.position.y = TOP + bobOf(squareOf(spots[seat]));
      if (gone.has(seat) || clock - lastMoved[seat] < 450) return;
      const want = Math.atan2(camera.position.x - token.position.x, camera.position.z - token.position.z);
      const delta = ((want - token.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(delta) > 0.01) token.rotation.y += delta * Math.min(1, dt * 5);
    });
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
    // Ease towards where the player turned it; left alone, it sways gently from side to side.
    view.idle += dt;
    view.yaw += (view.goalYaw - view.yaw) * Math.min(1, dt * 8);
    view.elev += (view.goalElev - view.elev) * Math.min(1, dt * 8);
    const sway = reduceMotion ? 0 : Math.sin(now / 7000) * 0.12 * Math.min(1, Math.max(0, view.idle - 2) / 3);
    const yaw = view.yaw + sway, flat = Math.cos(view.elev) * cam.dist;
    camera.position.set(cam.target.x + Math.sin(yaw) * flat, cam.target.y + Math.sin(view.elev) * cam.dist, cam.target.z + Math.cos(yaw) * flat);
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
    // Walls in a light shade of the owner's colour, roof in a deep one (Sky 2026-10-01: easy to tell whose it is).
    const body = shadowy(new T.Mesh(new T.BoxGeometry(w, h, w), mat(new T.Color(color).multiplyScalar(0.7).getHex())));
    body.position.y = h / 2;
    g.add(body);
    const roof = shadowy(new T.Mesh(new T.ConeGeometry(w * 0.85, w * 0.7, 4), mat(new T.Color(color).multiplyScalar(0.25).getHex())));
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
      const tower = shadowy(new T.Mesh(new T.BoxGeometry(0.42, 0.9, 0.42), mat(new T.Color(color).multiplyScalar(0.7).getHex(), 0.3)));
      tower.position.y = 0.45;
      g.add(tower);
      for (let r = 0; r < 4; r++) {
        for (const x of [-0.1, 0.1]) {
          const w = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.01), new T.MeshBasicMaterial({ color: 0xffd36b }));
          w.position.set(x, 0.2 + r * 0.19, 0.216);
          g.add(w);
        }
      }
      const cap = shadowy(new T.Mesh(new T.BoxGeometry(0.48, 0.08, 0.48), mat(new T.Color(color).multiplyScalar(0.25).getHex())));
      cap.position.y = 0.94;
      g.add(cap);
    }
    if (level >= 4) {
      const base = shadowy(new T.Mesh(new T.CylinderGeometry(0.3, 0.36, 0.5, 20), mat(new T.Color(color).multiplyScalar(0.7).getHex())));
      base.position.y = 0.25;
      g.add(base);
      const mid = shadowy(new T.Mesh(new T.CylinderGeometry(0.2, 0.26, 0.5, 20), mat(new T.Color(color).multiplyScalar(0.25).getHex())));
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

  // ---------- 領地 decor ----------
  const decorGroup = new T.Group();
  scene.add(decorGroup);
  const houseTiles: string[] = [];
  function rentHouse() {
    const g = new T.Group();
    const purple = mat(0x7c3aed, 0.35), gold = mat(0xfbd000, 0.15, { metalness: 0.7, emissive: 0x5a3d00 });
    const body = shadowy(new T.Mesh(new T.BoxGeometry(0.46, 0.5, 0.46), mat(0xf5ecff, 0.5)));
    body.position.y = 0.25;
    g.add(body);
    const top = shadowy(new T.Mesh(new T.ConeGeometry(0.4, 0.42, 4), purple));
    top.position.y = 0.71;
    top.rotation.y = Math.PI / 4;
    g.add(top);
    const pole = shadowy(new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.4, 8), gold));
    pole.position.y = 1.1;
    g.add(pole);
    const flag = shadowy(new T.Mesh(new T.BoxGeometry(0.24, 0.14, 0.02), gold));
    flag.position.set(0.12, 1.22, 0);
    g.add(flag);
    const sign = new T.Mesh(new T.BoxGeometry(0.2, 0.2, 0.01), new T.MeshBasicMaterial({ color: 0xfbd000 }));
    sign.position.set(0, 0.3, 0.236);
    g.add(sign);
    return g;
  }
  function station() {
    const g = new T.Group();
    const hall = shadowy(new T.Mesh(new T.BoxGeometry(1.4, 0.6, 0.7), mat(0xfff1d6, 0.5)));
    hall.position.y = 0.3;
    g.add(hall);
    const cap = shadowy(new T.Mesh(new T.BoxGeometry(1.6, 0.12, 0.9), mat(0x1e3a8a, 0.4)));
    cap.position.y = 0.66;
    g.add(cap);
    const clock = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.04, 20), new T.MeshBasicMaterial({ color: 0xffffff }));
    clock.rotation.x = Math.PI / 2;
    clock.position.set(0, 0.9, 0.3);
    g.add(clock);
    const tower = shadowy(new T.Mesh(new T.BoxGeometry(0.4, 0.5, 0.4), mat(0xe52521, 0.4)));
    tower.position.set(0, 0.95, 0);
    g.add(tower);
    // A little train waiting at the platform.
    const engine = shadowy(new T.Mesh(new T.BoxGeometry(0.7, 0.34, 0.32), mat(0x16a34a, 0.35)));
    engine.position.set(-0.2, 0.17, 0.75);
    g.add(engine);
    const funnel = shadowy(new T.Mesh(new T.CylinderGeometry(0.07, 0.09, 0.22, 12), mat(0x111827, 0.4)));
    funnel.position.set(-0.4, 0.44, 0.75);
    g.add(funnel);
    const car = shadowy(new T.Mesh(new T.BoxGeometry(0.6, 0.3, 0.3), mat(0xfbd000, 0.35)));
    car.position.set(0.5, 0.15, 0.75);
    g.add(car);
    return g;
  }
  const STATION_SPOTS: [number, number, number][] = layout.stations.map(([x, z]) => [x, 0, z]);
  function applyDecor(next: Decor) {
    for (const key of houseTiles.splice(0)) {
      const tile = tiles[key];
      if (!tile) continue;
      if (tile.house) tile.group.remove(tile.house);
      tile.house = null;
      tile.body.material.color.setHex(tile.base);
    }
    for (const key of next.houses) {
      const tile = tiles[key];
      if (!tile) continue;
      if (tile.house) tile.group.remove(tile.house);
      const g = rentHouse();
      g.position.copy(tile.inward).setY(TOP + 0.03);
      g.rotation.y = -tile.yaw;
      tile.group.add(g);
      tile.house = g;
      tile.body.material.color.setHex(0xe9d5ff);
      houseTiles.push(key);
    }
    roof.color.setHex(next.facade ? 0xfbd000 : 0xc0264b);
    roof.metalness = next.facade ? 0.6 : 0;
    if (deckMat) {
      deckMat.color.setHex(clover ? (next.facade ? 0xb6e07a : 0x8fd16a) : next.facade ? 0xffe08a : 0xf2d9a0);
      if (clover) deckMat.color.convertSRGBToLinear();
    }
    while (decorGroup.children.length) decorGroup.remove(decorGroup.children[0]);
    for (let n = 0; n < Math.min(next.stations, STATION_SPOTS.length); n++) {
      const s = station();
      const [x, y, z] = STATION_SPOTS[n];
      s.position.set(x, y, z);
      s.rotation.y = Math.atan2(-x, -z); // face the middle of the board
      s.scale.setScalar(0.8);
      decorGroup.add(s);
    }
  }
  if (decor) applyDecor(decor);

  const api: BoardScene = {
    focus(seat, level = "near") {
      dragged = false;
      if (seat === null) {
        goal.follow = -1;
        goal.target.copy(WIDE.target);
        goal.dist = WIDE.dist;
      } else {
        goal.follow = seat;
        // 中距離 (Sky 2026-10-01): still following the player, halfway out towards the whole board.
        goal.dist = level === "mid" ? (CLOSE + WIDE.dist) / 2 : CLOSE;
      }
    },
    setSpeed(value) {
      speed = value;
    },
    async roll(seat, which, value) {
      const base = tokens[seat].position;
      if (which === 0) dice[1].visible = false;
      // Both dice sit in front of whoever is throwing; the first one follows them to the new square.
      dice.forEach((d, i) => d.position.set(base.x + (i ? 0.45 : -0.45), i === which ? 2.5 : TOP + 0.3, base.z + 1.1));
      const d = dice[which];
      const spin = [Math.random() * 8 + 6, Math.random() * 8 + 6, Math.random() * 8 + 6];
      d.visible = true;
      await tween(650, (k) => {
        d.rotation.set(spin[0] * (1 - k), spin[1] * (1 - k), spin[2] * (1 - k));
        if (k === 1) d.rotation.set(...UP[value]);
        d.position.y = TOP + 0.3 + Math.abs(Math.sin(k * Math.PI * 2.5)) * (1 - k) * 2;
      });
    },
    hideDice() {
      dice.forEach((d) => (d.visible = false));
    },
    async stepTo(seat, spot) {
      lastMoved[seat] = performance.now();
      const token = tokens[seat];
      const left = squareOf(spots[seat]);
      spots[seat] = spot;
      const from = token.position.clone(), to = place(seat, spot);
      settle(left, seat);
      settle(squareOf(spot), seat);
      face(seat, to);
      if (rigs.has(seat)) {
        // 3D characters walk their own walk rather than hop.
        walking(seat, true);
        await tween(380, (k) => {
          token.position.lerpVectors(from, to, k);
          token.position.y = TOP + Math.abs(Math.sin(k * Math.PI * 2)) * 0.03;
        });
        walking(seat, false);
      } else {
        await tween(230, (k) => {
          token.position.lerpVectors(from, to, k);
          token.position.y = TOP + Math.sin(k * Math.PI) * 0.6;
        });
      }
      squash(keyOf(spot));
    },
    async flyTo(seat, spot) {
      lastMoved[seat] = performance.now() + 1200;
      const token = tokens[seat];
      const left = squareOf(spots[seat]);
      spots[seat] = spot;
      const from = token.position.clone(), to = place(seat, spot);
      settle(left, seat);
      settle(squareOf(spot), seat);
      face(seat, to);
      walking(seat, true);
      await tween(1100, (k) => {
        token.position.lerpVectors(from, to, k);
        token.position.y = TOP + Math.sin(k * Math.PI) * 4.5;
        token.rotation.y += 0.2;
      });
      walking(seat, false);
      lastMoved[seat] = performance.now();
      squash(keyOf(spot));
    },
    async own(key, seat, level) {
      const tile = tiles[key];
      if (!tile) return;
      const color = hex(colours[seat]);
      const m = tile.body.material, from = m.color.clone(), to = new T.Color(color).multiplyScalar(0.3); // the land in the owner's own deep colour (Sky 2026-10-02: deeper still)
      if (tile.house) tile.group.remove(tile.house);
      const g = buildingFor(level, color);
      g.position.copy(tile.inward).setY(TOP + 0.03);
      g.rotation.y = -tile.yaw;
      const size = 0.85; // a touch smaller, so buildings don't hide the next square's players
      g.scale.set(size, 0.01, size);
      tile.group.add(g);
      tile.house = g;
      // A painted lot takes the owner's colour too (lighter, so the picture still shows).
      const pic = tile.pic, picFrom = pic?.color.clone(), picTo = new T.Color(color).lerp(new T.Color(0xffffff), 0.25);
      await tween(700, (k) => {
        m.color.copy(from).lerp(to, Math.min(1, k * 1.5));
        if (pic) pic.color.copy(picFrom).lerp(picTo, Math.min(1, k * 1.5));
        const s = k < 0.75 ? (k / 0.75) * 1.2 : 1.2 - ((k - 0.75) / 0.25) * 0.2;
        g.scale.set(size, Math.max(0.01, s * size), size);
      });
    },
    clear(key) {
      const tile = tiles[key];
      if (!tile) return;
      if (tile.house) tile.group.remove(tile.house);
      tile.house = null;
      tile.body.material.color.setHex(tile.base);
      tile.pic?.color.setHex(PIC_WHITE);
    },
    async coinsFly(fromSeat, toSeat, count) {
      const from = tokens[fromSeat].position.clone();
      const to = toSeat === null ? new T.Vector3(layout.hub[0], layout.hub[1], layout.hub[2]) : tokens[toSeat].position.clone();
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
    async fireworks(seat, shots = 1) {
      const base = tokens[seat].position.clone();
      const shoot = async (n: number) => {
        await wait(n * 380);
        const colour = FIREWORK_COLOURS[(seat + n) % FIREWORK_COLOURS.length];
        const mat = new T.MeshBasicMaterial({ color: colour, transparent: true });
        const rocket = new T.Mesh(sparkGeo, mat);
        const from = new T.Vector3(base.x + (n % 2 ? 0.5 : -0.5) * Math.min(n, 1), TOP, base.z);
        const top = from.y + 3 + Math.random();
        scene.add(rocket);
        await tween(500, (k) => {
          rocket.position.set(from.x, from.y + (top - from.y) * (1 - (1 - k) * (1 - k)), from.z);
          if (k === 1) scene.remove(rocket);
        });
        const sparks = Array.from({ length: 28 }, () => {
          const spark = new T.Mesh(sparkGeo, mat);
          const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), v = 1.4 + Math.random() * 0.6;
          scene.add(spark);
          return { spark, dir: new T.Vector3(Math.sin(b) * Math.cos(a) * v, Math.cos(b) * v, Math.sin(b) * Math.sin(a) * v) };
        });
        await tween(1100, (k) => {
          const e = 1 - (1 - k) * (1 - k);
          for (const { spark, dir } of sparks) {
            spark.position.set(from.x + dir.x * e, top + dir.y * e - k * k * 1.2, from.z + dir.z * e);
            spark.scale.setScalar(1.3 - k);
            if (k === 1) scene.remove(spark);
          }
          mat.opacity = 1 - k * k;
        });
        mat.dispose();
      };
      await Promise.all(Array.from({ length: shots }, (_, n) => shoot(n)));
    },
    async sparkle(seat) {
      const centres =
        seat === "dice" ? dice.filter((d) => d.visible).map((d) => d.position.clone()) : [tokens[seat].position.clone().setY(TOP + 0.3)];
      const jobs = centres.flatMap((at) =>
        Array.from({ length: 10 }, (_, n) => {
          const star = new T.Mesh(starGeo, starMat);
          const a = (n / 10) * Math.PI * 2 + Math.random() * 0.4, r = 0.35 + Math.random() * 0.35;
          scene.add(star);
          return tween(700 + Math.random() * 300, (k) => {
            star.position.set(at.x + Math.cos(a) * r * (0.6 + k), at.y + 0.2 + k * 1.1, at.z + Math.sin(a) * r * (0.6 + k));
            star.rotation.set(k * 6, k * 4, 0);
            star.scale.setScalar(Math.sin(k * Math.PI) * 1.2);
            if (k === 1) scene.remove(star);
          });
        }),
      );
      if (seat === "dice") {
        const shown = dice.filter((d) => d.visible);
        jobs.push(tween(500, (k) => shown.forEach((d) => d.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.35))));
      }
      await Promise.all(jobs);
    },
    cheer(seat) {
      perform(seat, "cheer");
    },
    special(seat) {
      perform(seat, "special");
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
    setDecor(next) {
      applyDecor(next);
    },
    removeToken(seat) {
      tokens[seat].visible = false;
      gone.add(seat);
      settle(squareOf(spots[seat]), seat);
    },
    async showPickup(key, icon = "🃏") {
      const tile = tiles[key];
      if (!tile || cards.has(key)) return;
      const card = new T.Group();
      // A purple card with the icon on both faces, and a soft glow round it.
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 176;
      const x = c.getContext("2d")!;
      const grad = x.createLinearGradient(0, 0, 0, 176);
      grad.addColorStop(0, "#A78BFA");
      grad.addColorStop(1, "#6D28D9");
      x.fillStyle = grad;
      x.fillRect(0, 0, 128, 176);
      x.strokeStyle = "#FBD000";
      x.lineWidth = 10;
      x.strokeRect(5, 5, 118, 166);
      x.font = "72px system-ui, sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(icon, 64, 92);
      const face = new T.CanvasTexture(c);
      face.encoding = T.sRGBEncoding;
      card.add(new T.Mesh(new T.PlaneGeometry(0.46, 0.63), new T.MeshBasicMaterial({ map: face, side: T.DoubleSide })));
      const halo = new T.Mesh(new T.PlaneGeometry(0.8, 0.98), new T.MeshBasicMaterial({ color: 0xfbd000, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
      halo.position.z = -0.01;
      card.add(halo);
      // Riding on its island, so it floats up and down with it.
      card.position.set(0, TOP + 0.9, 0);
      tile.group.add(card);
      cards.set(key, card);
      floaters.push({ obj: card, base: TOP + 0.9, spin: true });
      await tween(400, (k) => card.scale.setScalar(k < 0.7 ? (k / 0.7) * 1.2 : 1.2 - (k - 0.7) * 0.66));
    },
    async takePickup(seat, key) {
      const card = cards.get(key);
      if (!card) return;
      cards.delete(key);
      const i = floaters.findIndex((f) => f.obj === card);
      if (i >= 0) floaters.splice(i, 1);
      const from = card.getWorldPosition(new T.Vector3());
      card.parent.remove(card);
      scene.add(card);
      card.position.copy(from);
      const to = tokens[seat].position.clone().setY(TOP + 0.6);
      await tween(500, (k) => {
        card.position.lerpVectors(from, to, k);
        card.position.y += Math.sin(k * Math.PI) * 0.6;
        card.rotation.y += 0.4;
        card.scale.setScalar(1 - k * 0.8);
        if (k === 1) scene.remove(card);
      });
    },
    async monsterAttack(side, seat, to, blocked) {
      const m = monsters[side];
      const token = tokens[seat];
      const target = token.position.clone().setY(TOP + 0.4);
      const from = m ? m.mouth.getWorldPosition(new T.Vector3()) : new T.Vector3(layout.hub[0], layout.hub[1], layout.hub[2]);
      // Turn to face the target and rear back.
      if (m) {
        const p = m.group.getWorldPosition(new T.Vector3());
        // A picture can't turn round, so it only rears back.
        const turn = m.flat ? m.group.rotation.y : Math.atan2(target.x - p.x, target.z - p.z);
        const start = m.group.rotation.y;
        await tween(300, (k) => {
          m.group.rotation.y = start + (turn - start) * k;
          m.group.scale.set(1 + k * 0.08, 1 - k * 0.1, 1 + k * 0.08);
        });
        void tween(250, (k) => m.group.scale.set(1.08 - k * 0.08, 0.9 + k * 0.1, 1.08 - k * 0.08));
      }
      // The shot: a fireball with a trail (dragon) or an iron cannonball (golem).
      const fire = side === "left";
      const ball = new T.Mesh(
        new T.SphereGeometry(fire ? 0.22 : 0.18, 16, 12),
        fire ? new T.MeshBasicMaterial({ color: 0xffa21f }) : mat(0x1f2328, 0.35, { metalness: 0.6 }),
      );
      scene.add(ball);
      const trail: any[] = [];
      await tween(700, (k) => {
        ball.position.lerpVectors(from, target, k);
        ball.position.y += Math.sin(k * Math.PI) * 2.2;
        if (fire && Math.random() < 0.7) {
          const ember = new T.Mesh(sparkGeo, new T.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0xff5a1f : 0xffd23f, transparent: true }));
          ember.position.copy(ball.position);
          scene.add(ember);
          trail.push({ ember, born: performance.now() });
        }
        for (const t of trail) t.ember.material.opacity = Math.max(0, 1 - (performance.now() - t.born) / 400);
        if (k === 1) scene.remove(ball);
      });
      trail.forEach((t) => scene.remove(t.ember));
      if (blocked) {
        // A golden bubble takes the hit.
        const bubble = new T.Mesh(new T.SphereGeometry(0.6, 24, 16), new T.MeshBasicMaterial({ color: 0xfbd000, transparent: true, opacity: 0.5, depthWrite: false }));
        bubble.position.copy(target);
        scene.add(bubble);
        await tween(700, (k) => {
          bubble.scale.setScalar(0.6 + k * 0.8);
          bubble.material.opacity = 0.5 * (1 - k);
          if (k === 1) scene.remove(bubble);
        });
        return;
      }
      // Boom, and the target is sent flying back.
      const flash = new T.Mesh(new T.SphereGeometry(0.4, 16, 12), new T.MeshBasicMaterial({ color: fire ? 0xff8a1f : 0xd1d5db, transparent: true }));
      flash.position.copy(target);
      scene.add(flash);
      void tween(500, (k) => {
        flash.scale.setScalar(0.5 + k * 2.5);
        flash.material.opacity = 1 - k;
        if (k === 1) scene.remove(flash);
      });
      const left = squareOf(spots[seat]);
      spots[seat] = to;
      const a = token.position.clone(), b = place(seat, to);
      lastMoved[seat] = performance.now() + 900;
      await tween(800, (k) => {
        token.position.lerpVectors(a, b, k);
        token.position.y = TOP + Math.sin(k * Math.PI) * 1.8;
        token.rotation.z = Math.sin(k * Math.PI * 4) * 0.5 * (1 - k);
      });
      token.rotation.z = 0;
      settle(left, seat);
      settle(squareOf(to), seat);
      squash(squareOf(to));
    },
    async floatText(seat, text, colour = "#E52521") {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 96;
      const x = c.getContext("2d")!;
      x.font = "900 64px system-ui, sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.lineWidth = 12;
      x.strokeStyle = "#ffffff";
      // Energy amounts run to six digits: squeeze them to fit rather than clip.
      x.strokeText(text, 128, 50, 240);
      x.fillStyle = colour;
      x.fillText(text, 128, 50, 240);
      const map = new T.CanvasTexture(c);
      const sprite = new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthTest: false }));
      sprite.scale.set(1.2, 0.45, 1);
      sprite.renderOrder = 10;
      const at = tokens[seat].position.clone();
      scene.add(sprite);
      await tween(1200, (k) => {
        sprite.position.set(at.x, at.y + 1.3 + k * 0.9, at.z);
        sprite.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        if (k === 1) {
          scene.remove(sprite);
          map.dispose();
          sprite.material.dispose();
        }
      });
    },
    lockTile(key, locked) {
      const tile = tiles[key];
      if (!tile) return;
      const old = tile.group.getObjectByName("lock");
      if (old) tile.group.remove(old);
      if (!locked) return;
      const g = new T.Group();
      g.name = "lock";
      const steel = mat(0x94a3b8, 0.3, { metalness: 0.6 });
      // Two chains across the square, links alternating flat and upright.
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const chain = new T.Group();
        for (let i = -4; i <= 4; i++) {
          const link = new T.Mesh(new T.TorusGeometry(0.07, 0.022, 6, 12), steel);
          link.position.x = i * 0.11;
          link.rotation.x = i % 2 ? Math.PI / 2 : 0;
          chain.add(link);
        }
        chain.rotation.y = turn;
        chain.position.y = TOP + 0.06;
        g.add(chain);
      }
      const body = shadowy(new T.Mesh(new T.BoxGeometry(0.3, 0.26, 0.12), mat(0xfbd000, 0.25, { metalness: 0.6 })));
      body.position.y = TOP + 0.2;
      g.add(body);
      const shackle = new T.Mesh(new T.TorusGeometry(0.1, 0.03, 8, 16, Math.PI), steel);
      shackle.position.y = TOP + 0.33;
      g.add(shackle);
      tile.group.add(g);
      g.scale.setScalar(0.01);
      void tween(400, (k) => g.scale.setScalar(0.01 + (1 + Math.sin(k * Math.PI) * 0.3 - 0.01) * k));
    },
    async blast(key) {
      const tile = tiles[key];
      if (!tile) return;
      const at = tile.group.position.clone().setY(TOP + 0.3);
      const flash = new T.Mesh(new T.SphereGeometry(0.5, 16, 12), new T.MeshBasicMaterial({ color: 0xffb020, transparent: true }));
      flash.position.copy(at);
      scene.add(flash);
      const colours = [0xff5a1f, 0xffb020, 0x6b7280, 0x9a5b2e];
      const bits = Array.from({ length: 26 }, (_, n) => {
        const bit = new T.Mesh(n % 3 ? sparkGeo : new T.BoxGeometry(0.1, 0.1, 0.1), new T.MeshBasicMaterial({ color: colours[n % 4], transparent: true }));
        const a = Math.random() * Math.PI * 2, up = 1.5 + Math.random() * 1.5, out = 0.8 + Math.random();
        scene.add(bit);
        return { bit, v: new T.Vector3(Math.cos(a) * out, up, Math.sin(a) * out) };
      });
      // The square itself jolts.
      const base = tile.group.position.clone();
      await tween(900, (k) => {
        flash.scale.setScalar(0.3 + k * 2.2);
        flash.material.opacity = Math.max(0, 1 - k * 1.6);
        for (const { bit, v } of bits) {
          bit.position.set(at.x + v.x * k, at.y + v.y * k - 3 * k * k, at.z + v.z * k);
          bit.rotation.x += 0.3;
          bit.material.opacity = 1 - k;
        }
        tile.group.position.set(base.x + Math.sin(k * 60) * 0.06 * (1 - k), base.y, base.z);
        if (k === 1) {
          scene.remove(flash);
          bits.forEach(({ bit }) => scene.remove(bit));
          tile.group.position.copy(base);
        }
      });
    },
    async puff(seat) {
      const at = tokens[seat].position.clone();
      const clouds = Array.from({ length: 10 }, () => {
        const cloud = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), new T.MeshBasicMaterial({ color: 0xe5e7eb, transparent: true }));
        const a = Math.random() * Math.PI * 2;
        scene.add(cloud);
        return { cloud, dx: Math.cos(a) * 0.5, dz: Math.sin(a) * 0.5, dy: 0.3 + Math.random() * 0.6 };
      });
      await tween(650, (k) => {
        for (const { cloud, dx, dz, dy } of clouds) {
          cloud.position.set(at.x + dx * k, at.y + 0.35 + dy * k, at.z + dz * k);
          cloud.scale.setScalar(0.6 + k * 1.2);
          cloud.material.opacity = 0.9 * (1 - k);
          if (k === 1) scene.remove(cloud);
        }
      });
    },
    warp(seat, spot) {
      const left = squareOf(spots[seat]);
      spots[seat] = spot;
      tokens[seat].position.copy(place(seat, spot));
      settle(left, seat);
      settle(squareOf(spot), seat);
    },
    async rainbow(seat) {
      const at = tokens[seat].position.clone();
      const bands = [0xe52521, 0xf97316, 0xfbd000, 0x22c55e, 0x3b82f6, 0x8b5cf6];
      const arc = new T.Group();
      bands.forEach((colour, i) => {
        const band = new T.Mesh(new T.TorusGeometry(0.9 - i * 0.07, 0.035, 6, 32, Math.PI), new T.MeshBasicMaterial({ color: colour, transparent: true }));
        arc.add(band);
      });
      arc.position.set(at.x, at.y + 0.1, at.z);
      scene.add(arc);
      await tween(1300, (k) => {
        arc.scale.set(Math.min(1, k * 3), Math.min(1, k * 3), 1);
        arc.children.forEach((band: any) => (band.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3));
        if (k === 1) scene.remove(arc);
      });
    },
    async shatter(seat) {
      const token = tokens[seat];
      const at = token.position.clone();
      const colour = hex(colours[seat]);
      const shards = Array.from({ length: 18 }, () => {
        const shard = new T.Mesh(new T.TetrahedronGeometry(0.09), new T.MeshStandardMaterial({ color: colour, roughness: 0.4, transparent: true }));
        const a = Math.random() * Math.PI * 2;
        scene.add(shard);
        return { shard, v: new T.Vector3(Math.cos(a) * (0.6 + Math.random()), 1 + Math.random() * 1.5, Math.sin(a) * (0.6 + Math.random())) };
      });
      token.visible = false;
      await tween(900, (k) => {
        for (const { shard, v } of shards) {
          shard.position.set(at.x + v.x * k, at.y + 0.4 + v.y * k - 2.5 * k * k, at.z + v.z * k);
          shard.rotation.x += 0.2;
          shard.rotation.z += 0.15;
          shard.material.opacity = 1 - k;
          if (k === 1) scene.remove(shard);
        }
      });
      gone.add(seat);
      settle(squareOf(spots[seat]), seat);
    },
    wait,
    dispose() {
      disposed = true;
      rigs.forEach((rig) => window.clearTimeout(rig.idle));
      cancelAnimationFrame(frameId);
      timers.forEach((id) => window.clearTimeout(id));
      anims.length = 0;
      watch.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("lostpointercapture", onUp);
      canvas.removeEventListener("wheel", onWheel);
      renderer.dispose();
      canvas.remove();
    },
  };
  return api;
}
