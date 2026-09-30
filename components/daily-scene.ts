/**
 * 第一層 每日棋盤 in 3D: the 28 squares as floating islands in a diamond ring, each labelled in
 * words, a big stone island in the middle with GO carved in it as a glowing rune (tap it to roll),
 * and you as your chosen 3D character walking round (a hot-air balloon until the model loads). Same floating look and camera as the public
 * table: drag to turn and tilt, pinch to zoom, a gentle sway when left alone.
 */
import { ACTORS, loadGltfLoader } from "@/components/eight-scene";
import { createSpace } from "@/components/backdrop";
import { buildMonster, type Monster, type Mood } from "@/components/monster";
import { BOARD_SIZE, TILES, type TileKind } from "@/lib/board";

export type PetLook = { element: number; stage: number; legend: boolean; hungry: boolean; /** Egg only: rolls towards hatching, and how many it needs. */ rolls?: number; hatchAt?: number };

export type DailyScene = {
  /** Fly the ship to a square (one square at a time as the walk plays). */
  moveTo(index: number): void;
  /** Glow the square the ship stopped on (null: none). */
  highlight(index: number | null): void;
  /** Words floating up from the ship, e.g. "+2 金幣". */
  floatText(text: string, colour?: string): void;
  /** Light the GO rune on the middle rock (your turn, dice left) or let it go dim. */
  setReady(ready: boolean): void;
  /** Your character throws up its arms (a good landing). */
  cheer(): void;
  /** 龍捲風: a twister lifts your character off its square, spinning, and carries it to square `index`. */
  blowTo(index: number): void;
  /** Throw two small dice onto the middle stone; they tumble and settle showing these faces. */
  throwDice(faces: [number, number]): void;
  /** Fade the dice away (the walk is over). */
  clearDice(): void;
  /** Your dragon on the middle stone (null: none yet). A 龍蛋 sits at the back; once hatched it
   * wanders, rests, flies up, naps, and waits for food with a 🍖 bubble when hungry. */
  setPet(look: PetLook | null): void;
  /** Your dragon hops about happily (food, a good roll, or a pat). */
  petHappy(): void;
  /** Called when the egg on the stone is tapped (to open the dragon screen). */
  onEggTap(handler: () => void): void;
  /** Put the camera back over the whole board. */
  recentre(): void;
  dispose(): void;
};

const SIDE = BOARD_SIZE / 4; // 7 steps between corners
const PITCH = 1.45;
const R = (SIDE * PITCH) / Math.SQRT2;
const TOP = 0.34;
/** Words floating up over the hero are switched off (Sky). */
const NO_FLOATS = true;
/** The GO stone is twice the size of a square's stone. */
const GO_SIZE = 3;
/** Only left and right: the board keeps this tilt (about 50°). */
const BOARD_ELEV = 0.9;
/** How far below the board the camera aims (moves the board up the screen). */
const AIM_DROP = 1.8;
/** Pinch zoom goes this much closer at most. */
const ZOOM_IN = 1.15;
/** Looking at the diamond from a corner turns it into a square on screen, which fills a phone better. */
const HOME_YAW = Math.PI / 4;
/** How much closer than the whole-board view the camera sits (the edges run off a phone; the camera follows the balloon). */
const ZOOM = 1.15;
/** Island top colour for each kind of square. */
const TOPS: Record<TileKind, number> = {
  start: 0xfbd000,
  coin: 0x62b843,
  meat: 0xf08a5d,
  steal: 0x475569,
  chest: 0xf59e0b,
  lucky: 0x38bdf8,
  attack: 0xe52521,
  jail: 0x64748b,
  hole: 0x2e1f4d,
};

/** Square i on the diamond: start at the front corner, then round the left, back and right corners. */
/** Ease an angle toward another the short way round. */
function turnToward(from: number, to: number, rate: number) {
  const delta = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return from + delta * Math.min(1, rate);
}

function squarePoint(i: number): [number, number] {
  const corners: [number, number][] = [[0, R], [-R, 0], [0, -R], [R, 0]];
  const side = Math.floor(i / SIDE), k = i % SIDE;
  const [ax, az] = corners[side], [bx, bz] = corners[(side + 1) % 4];
  return [ax + ((bx - ax) * k) / SIDE, az + ((bz - az) * k) / SIDE];
}

export function createDailyScene(T: any, container: HTMLElement, labels: string[], start: number, onGo: () => void = () => undefined, actor?: string): DailyScene {
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
  const shadowTex = soft("rgba(0,0,0,0.5)", "rgba(0,0,0,0)");
  const glowTex = soft("rgba(170,210,255,0.9)", "rgba(170,210,255,0)");
  const FLOOR = -4.4;

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
    // A stubby round rock under the soil: a short column with a rounded bottom, not a spike.
    const rockH = 0.42 * size;
    const rock = shadowy(new T.Mesh(rough(new T.CylinderGeometry(0.46 * size, 0.38 * size, rockH, 9, 2), 0.06 * size), flat(0x5d6168)));
    rock.position.y = TOP - 0.34 - rockH / 2;
    g.add(rock);
    const cap = shadowy(new T.Mesh(rough(new T.SphereGeometry(0.38 * size, 9, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0.05 * size), flat(0x565a61)));
    cap.scale.y = 0.55;
    cap.position.y = TOP - 0.34 - rockH;
    g.add(cap);
    return { group: g, top: grass };
  }

  /** The picture for each kind of square. */
  const iconCache: Record<string, any> = {};
  function iconTex(kind: string) {
    if (!iconCache[kind]) {
      iconCache[kind] = new T.TextureLoader().load(`/art/icons/${kind}.webp`);
      iconCache[kind].encoding = T.sRGBEncoding;
    }
    return iconCache[kind];
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
    sprite.scale.set(1.4, 0.52, 1);
    return sprite;
  }

  // ---------- The ring of islands ----------
  const breathers: { obj: any; phase: number; period: number; shadow: any; glow: any; base: number; glowY: number; amp?: number }[] = [];
  const islands: { group: any; top: any; base: number; glow: any; tag: any }[] = [];
  TILES.forEach((tile, i) => {
    const [x, z] = squarePoint(i);
    const big = tile.kind !== "coin";
    const isle = islandMesh(big ? 1.3 : 1.1, 200 + i * 23, TOPS[tile.kind]);
    isle.group.position.set(x, 0, z);
    scene.add(isle.group);
    // A bare stone top (Sky): the picture above says what the square is. Each stone a slightly different grey.
    const grey = [0x9a958c, 0xa39e94, 0x8f8a82, 0xaaa59a][i % 4];
    isle.top.material = new T.MeshStandardMaterial({ color: new T.Color(grey).convertSRGBToLinear(), roughness: 0.95, flatShading: true });
    // No words over the squares (Sky): a picture of what the square does instead, floating above it.
    void label;
    void labels;
    // The picture is printed flat on the stone (Sky), its top toward the middle of the board.
    const iconSize = big ? 1.0 : 0.85;
    const tag = new T.Mesh(
      new T.PlaneGeometry(iconSize, iconSize),
      new T.MeshBasicMaterial({ map: iconTex(tile.kind), transparent: true, alphaTest: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    tag.rotation.order = "YXZ";
    tag.rotation.y = Math.atan2(-x, -z) + Math.PI;
    tag.rotation.x = -Math.PI / 2;
    tag.position.set(0, TOP + 0.03, 0);
    tag.renderOrder = 2;
    isle.group.add(tag);
    const shadow = new T.Mesh(new T.PlaneGeometry(1.8, 1.8), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, FLOOR + 0.02, z);
    scene.add(shadow);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: tile.kind === "start" ? 0xffe27a : 0xaad2ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.45 }));
    glow.scale.set(1.5, 0.9, 1);
    glow.position.set(x, TOP - 1.2, z);
    scene.add(glow);
    // Neighbours are well out of step (golden-angle phases), so some rise while others sink.
    breathers.push({ obj: isle.group, phase: i * 2.39996 + Math.random() * 0.4, period: 4.2 + Math.random() * 1.6, shadow, glow, base: 0, glowY: TOP - 1.2, amp: 0.08 });
    islands.push({ group: isle.group, top: isle.top, base: TOPS[tile.kind], glow, tag });
  });
  // The main island in the middle: a big stone with GO carved in as a rune. Tap it to roll;
  // the rune glows when it's your go. Open air between it and the ring of squares.
  /** The turn that puts face v on top. */
  const faceUp = (v: number) => {
    const base = new T.Quaternion();
    if (v === 6) base.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
    else if (v === 2) base.setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
    else if (v === 5) base.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
    else if (v === 3) base.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2);
    else if (v === 4) base.setFromAxisAngle(new T.Vector3(0, 0, 1), -Math.PI / 2);
    return base;
  };
  const bigRock = new T.Group();
  const dice: { mesh: any; rest: any; from: any; q: any; spin: any; born: number; fade: number; idle: boolean; home: any; back: number }[] = [];
  let dieMats: any[] = [];
  const rune = { ready: false, level: 0, pressAt: -1e9 };
  let stone: any = null;
  let runeLight: any, runeRing: any, goStone: any, goGlow: any;
  {
    // A stone top (Sky 2026-09-28: stone like the squares round it, instead of the lawn).
    const big = islandMesh(6, 977, 0x9a958c);
    big.top.material = new T.MeshStandardMaterial({ color: new T.Color(0x96918a).convertSRGBToLinear(), roughness: 0.95, flatShading: true });
    big.group.position.set(0, 0.1, 0);
    bigRock.add(big.group);
    stone = big.group;
    scene.add(bigRock);
    // Carved grooves (always there) and a glowing copy on top that lights up.
    const carve = (glow: boolean) => {
      const c = document.createElement("canvas");
      c.width = c.height = 512;
      const x = c.getContext("2d")!;
      x.translate(256, 256);
      x.strokeStyle = x.fillStyle = glow ? "#ffc94a" : "rgba(30,33,40,0.9)";
      if (glow) {
        x.shadowColor = "#ffb020";
        x.shadowBlur = 8;
      }
      x.lineWidth = 10;
      x.beginPath();
      x.arc(0, 0, 228, 0, Math.PI * 2);
      x.stroke();
      x.lineWidth = 5;
      x.beginPath();
      x.arc(0, 0, 196, 0, Math.PI * 2);
      x.stroke();
      // Little rune marks between the two rings.
      for (let k = 0; k < 16; k++) {
        x.save();
        x.rotate((k / 16) * Math.PI * 2);
        x.beginPath();
        const m = k % 4;
        if (m === 0) (x.moveTo(-8, -222), x.lineTo(0, -202), x.lineTo(8, -222));
        else if (m === 1) (x.moveTo(0, -224), x.lineTo(0, -200), x.moveTo(-8, -212), x.lineTo(8, -212));
        else if (m === 2) (x.moveTo(-7, -220), x.lineTo(7, -204));
        else x.arc(0, -212, 6, 0, Math.PI * 2);
        x.stroke();
        x.restore();
      }
      x.font = "900 190px Georgia, 'Times New Roman', serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.lineWidth = 14;
      x.lineJoin = "round";
      x.fillText("GO", 0, 12);
      const tex = new T.CanvasTexture(c);
      tex.encoding = T.sRGBEncoding;
      return tex;
    };
    const plate = (tex: any, glow: boolean) => {
      const m = new T.Mesh(
        new T.PlaneGeometry(4.4, 4.4),
        new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, ...(glow ? { blending: T.AdditiveBlending, opacity: 0 } : {}) }),
      );
      // Lie flat, turned so GO reads upright from the home camera angle.
      m.rotation.set(-Math.PI / 2, 0, HOME_YAW);
      m.position.y = TOP + (glow ? 0.03 : 0.02);
      big.group.add(m);
      return m;
    };
    void plate;
    // The GO stone (Sky 2026-09-30): a floating stone twice the size of a square, between the board and the
    // bottom of the screen, with GO carved on it — tap it to roll, and the dice fly from it onto the middle stone.
    // It hangs off the camera, so turning or zooming the board never moves it.
    const go = islandMesh(GO_SIZE, 311, 0x9a958c);
    go.top.material = new T.MeshStandardMaterial({ color: new T.Color(0x96918a).convertSRGBToLinear(), roughness: 0.95, flatShading: true });
    const goPlate = (glow: boolean) => {
      const m = new T.Mesh(
        new T.PlaneGeometry(GO_SIZE * 0.98, GO_SIZE * 0.98),
        new T.MeshBasicMaterial({ map: carve(glow), transparent: true, depthWrite: false, ...(glow ? { blending: T.AdditiveBlending, opacity: 0 } : {}) }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.y = TOP + (glow ? 0.03 : 0.02);
      go.group.add(m);
      return m;
    };
    goPlate(false);
    goGlow = goPlate(true);
    goStone = new T.Group();
    goStone.add(go.group);
    camera.add(goStone);
    scene.add(camera);
    runeRing = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffc860, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
    runeRing.scale.set(GO_SIZE * 1.6, GO_SIZE * 0.7, 1);
    runeRing.position.y = TOP + 0.2;
    go.group.add(runeRing);
    runeLight = new T.PointLight(0xffc060, 0, 5, 2);
    runeLight.position.y = TOP + 0.8;
    go.group.add(runeLight);
    // Two small dice that land on the front edge of the stone, clear of the rune.
    const pipTex = (v: number) => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const x = c.getContext("2d")!;
      // A warm cream face with a dark bronze rim, so the dice stand out on the grey stone.
      const face = x.createRadialGradient(54, 50, 10, 64, 64, 90);
      face.addColorStop(0, "#f7ecd2");
      face.addColorStop(1, "#dcc79c");
      x.fillStyle = face;
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = "#7a5a2e";
      x.lineWidth = 12;
      x.strokeRect(6, 6, 116, 116);
      const at: Record<number, [number, number][]> = {
        1: [[64, 64]],
        2: [[36, 36], [92, 92]],
        3: [[34, 34], [64, 64], [94, 94]],
        4: [[36, 36], [92, 36], [36, 92], [92, 92]],
        5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]],
        6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]],
      };
      x.fillStyle = v === 1 ? "#c81e1e" : "#111318";
      for (const [px, py] of at[v]) {
        x.beginPath();
        x.arc(px, py, v === 1 ? 16 : 11, 0, Math.PI * 2);
        x.fill();
      }
      const tex = new T.CanvasTexture(c);
      tex.encoding = T.sRGBEncoding;
      return tex;
    };
    // Box faces: +x, -x, +y, -y, +z, -z.
    const faceValues = [3, 4, 1, 6, 2, 5];
    dieMats = faceValues.map((v) => new T.MeshStandardMaterial({ map: pipTex(v), roughness: 0.4, emissive: new T.Color(0xffc040), emissiveIntensity: 0 }));
    for (let k = 0; k < 2; k++) {
      const die = shadowy(new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.5), dieMats));
      big.group.add(die);
      const a = Math.PI / 4 + (k ? 0.24 : -0.24);
      // Waiting spot: side by side in the middle of the lawn, across the camera's view.
      const side = k ? 1 : -1;
      const home = new T.Vector3(Math.cos(HOME_YAW) * 0.5 * side, TOP + 0.35, -Math.sin(HOME_YAW) * 0.5 * side);
      void a;
      const d = { mesh: die, rest: new T.Vector3(Math.cos(HOME_YAW) * 0.6 * side, TOP + 0.25, -Math.sin(HOME_YAW) * 0.6 * side), from: new T.Vector3(), q: faceUp(k ? 5 : 6), spin: new T.Vector3(), born: -1e9, fade: -1e9, idle: true, home, back: -1e9 };
      die.position.copy(home);
      die.quaternion.copy(d.q);
      die.scale.setScalar(1.4);
      dice.push(d);
    }
    const bits: any[] = [];
    [[3.6, -2.0, 0.45], [-3.5, -2.4, 0.35], [0.4, -2.8, 0.3]].forEach(([x, y, k], n) => {
      const bit = islandMesh(k * 2, 500 + n * 41, 0x9aa1ab);
      bit.group.position.set(x, y, n === 2 ? 3.6 : -0.8);
      scene.add(bit.group);
      bits.push(bit.group);
    });
    const shadow = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = FLOOR + 0.02;
    scene.add(shadow);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xaad2ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.4 }));
    glow.scale.set(6.5, 3, 1);
    glow.position.y = TOP - 2.2;
    scene.add(glow);
    breathers.push({ obj: big.group, phase: 0, period: 6, shadow, glow, base: 0.1, glowY: TOP - 2.2, amp: 0.22 });
    bits.forEach((b, n) => breathers.push({ obj: b, phase: n * 2, period: 4 + n, shadow: null, glow: null, base: b.position.y, glowY: 0, amp: 0.2 }));
  }

  // Outer space behind the board replaces the dark floor (and the islands' shadows on it).
  const backdrop = createSpace(T, scene, camera, { reduceMotion });
  for (const b of breathers) if (b.shadow) b.shadow.visible = false;

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

  // ---------- The hot-air balloon (you) ----------
  // Origin at the bottom of the basket; the balloon is about half an island wide and rides high,
  // so the square and its words underneath stay in view.
  const ship = new T.Group();
  const stripes = document.createElement("canvas");
  stripes.width = 256;
  stripes.height = 8;
  const st = stripes.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    st.fillStyle = i % 2 ? "#ffffff" : "#e52521";
    st.fillRect(i * 32, 0, 32, 8);
  }
  const stripeTex = new T.CanvasTexture(stripes);
  stripeTex.encoding = T.sRGBEncoding;
  const envelope = shadowy(new T.Mesh(new T.SphereGeometry(0.34, 24, 16), new T.MeshStandardMaterial({ map: stripeTex, roughness: 0.55 })));
  envelope.scale.set(1, 1.12, 1);
  envelope.position.y = 0.95;
  ship.add(envelope);
  const neck = shadowy(new T.Mesh(new T.CylinderGeometry(0.2, 0.09, 0.2, 16, 1, true), mat(0xe52521, 0.55, { side: T.DoubleSide })));
  neck.position.y = 0.6;
  ship.add(neck);
  const basket = shadowy(new T.Mesh(new T.BoxGeometry(0.2, 0.15, 0.2), mat(0x8b5a2b, 0.9)));
  basket.position.y = 0.075;
  ship.add(basket);
  const rim = new T.Mesh(new T.BoxGeometry(0.22, 0.03, 0.22), mat(0x5c3a1a, 0.9));
  rim.position.y = 0.16;
  ship.add(rim);
  const ropeMat = new T.LineBasicMaterial({ color: 0x3b2a1a });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const geo = new T.BufferGeometry().setFromPoints([new T.Vector3(x * 0.1, 0.16, z * 0.1), new T.Vector3(x * 0.13, 0.62, z * 0.13)]);
    ship.add(new T.Line(geo, ropeMat));
  }
  const flame = new T.Mesh(new T.ConeGeometry(0.06, 0.22, 10), new T.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
  flame.position.y = 0.34;
  ship.add(flame);
  const flameGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
  flameGlow.scale.set(0.8, 0.8, 1);
  flameGlow.position.y = 0.45;
  ship.add(flameGlow);
  let burnAt = -1e9;

  // ---------- Your character (replaces the balloon once its model has loaded) ----------
  const HERO_HEIGHT = 1.35;
  const hero = new T.Group();
  scene.add(hero);
  const heroState = { ready: false, mixer: null as any, walk: null as any, cheer: null as any, pace: 2, still: 0, cheering: false };
  let disposed = false;
  const who = actor ? ACTORS[actor] : undefined;
  if (who) {
    loadGltfLoader(T)
      .then((Loader) => new Promise<any>((resolve, reject) => new Loader().load(who.url, resolve, undefined, reject)))
      .then((gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.traverse((o: any) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
            o.material.metalness = 0;
            o.material.roughness = Math.max(0.6, o.material.roughness ?? 0.6);
          }
        });
        // The bodies stand 1.2 tall with their feet at 0.
        model.scale.setScalar(HERO_HEIGHT / 1.2);
        hero.add(model);
        const mixer = new T.AnimationMixer(model);
        const clip = (name: string) => gltf.animations.find((a: any) => a.name === name);
        const walk = mixer.clipAction(clip("walk") ?? gltf.animations[0]);
        walk.timeScale = who.walkPace;
        walk.play();
        walk.paused = true;
        const found = clip("cheer");
        const cheer = found ? mixer.clipAction(found) : null;
        if (cheer) {
          cheer.setLoop(T.LoopOnce, 1);
          cheer.clampWhenFinished = true;
        }
        mixer.addEventListener("finished", (e: any) => {
          if (e.action !== cheer) return;
          heroState.cheering = false;
          walk.reset();
          walk.play();
          walk.paused = true;
          cheer.crossFadeTo(walk, 0.3, false);
        });
        Object.assign(heroState, { ready: true, mixer, walk, cheer, pace: who.walkPace });
        ship.visible = false;
      })
      .catch(() => {
        // Keep the balloon.
      });
  }
  scene.add(ship);
  const shipAt = { index: start, fromIndex: start, from: new T.Vector3(), to: new T.Vector3(), t: 1 };
  const spotOf = (i: number) => {
    const [x, z] = squarePoint(((i % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE);
    return new T.Vector3(x, TOP + 1.25, z);
  };
  ship.position.copy(spotOf(start));
  shipAt.to.copy(ship.position);

  // ---------- Camera: drag to turn and tilt, pinch to zoom, sway when left alone ----------
  const view = { yaw: HOME_YAW, elev: BOARD_ELEV, goalYaw: HOME_YAW, goalElev: BOARD_ELEV, dist: 20, goalDist: 20, idle: 0 };
  // Aim a little below the board so the board sits higher on the screen, leaving room for the GO stone.
  const target = new T.Vector3(0, -AIM_DROP, 0);
  const canvas = renderer.domElement;
  const pointers = new Map<number, { x: number; y: number }>();
  let tap: { x: number; y: number; at: number } | null = null;
  const ray = new T.Raycaster();
  const onDown = (e: PointerEvent) => {
    // A first finger starts afresh, so a lost lift can't leave a ghost finger behind.
    if (e.isPrimary) pointers.clear();
    tap = pointers.size === 0 ? { x: e.clientX, y: e.clientY, at: performance.now() } : null;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onMove = (e: PointerEvent) => {
    const before = pointers.get(e.pointerId);
    if (!before) return;
    const pts = [...pointers.values()];
    if (pts.length > 1) tap = null;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    view.idle = 0;
    if (pts.length === 1) {
      view.goalYaw -= (e.clientX - before.x) * 0.006;
      // Left and right only; the tilt stays put (Sky 2026-09-30).
    } else {
      const other = pts.find((p) => p !== before)!;
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (was > 1 && is > 1) view.goalDist = Math.max(fitDist / ZOOM_IN, Math.min(fitDist * 1.25, view.goalDist * (was / is)));
    }
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    const t0 = tap;
    tap = null;
    if (e.type !== "pointerup" || !t0 || Math.hypot(e.clientX - t0.x, e.clientY - t0.y) > 10 || performance.now() - t0.at > 600) return;
    // A tap on the middle stone rolls the dice.
    const box = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), camera);
    // A pat on your dragon makes it happy (it doesn't roll).
    if (pet && ray.intersectObject(pet.m.group, true).length > 0) {
      if (pet.look.stage > 0) happy();
      else eggTap();
      return;
    }
    if (ray.intersectObject(goStone, true).length === 0) return;
    rune.pressAt = performance.now();
    if (rune.ready) onGo();
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    view.goalDist = Math.max(fitDist / ZOOM_IN, Math.min(fitDist * 1.25, view.goalDist * Math.exp(e.deltaY * 0.0012)));
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("lostpointercapture", onUp);
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
    fitDist = Math.max(9, ((R / Math.SQRT2) * 1.45) / Math.tan(half) / ZOOM);
    view.goalDist = view.dist = fitDist;
    // Halfway between the board's front corner and the bottom of the screen, worked out for this screen's
    // shape (a wider phone brings the board closer, so its front corner sits lower).
    const tanHalf = Math.tan((38 * Math.PI) / 360), halfH = tanHalf * fitDist;
    // The front reach is the corner at full zoom-in (the closest the board ever comes), plus its breathing.
    const e = BOARD_ELEV, front = (R + 0.9) * ZOOM_IN, up = (TOP + AIM_DROP + 0.3) * ZOOM_IN;
    const frontNdc = (-front * Math.sin(e) + up * Math.cos(e)) / ((fitDist - front * Math.cos(e) - up * Math.sin(e)) * tanHalf);
    // Keep clear of the bottom bar (the building button), about 100 px.
    const bottomNdc = -1 + (2 * 100) / h;
    const goHalf = (GO_SIZE * 0.5 * Math.sin(e) + 0.5) / halfH;
    const goNdc = Math.max(bottomNdc + goHalf * 0.6, Math.min(frontNdc - goHalf - 0.04, (frontNdc + bottomNdc) / 2));
    goStone.position.set(0, goNdc * halfH - TOP, -fitDist);
    goStone.rotation.set(BOARD_ELEV, 0, 0);
  }
  const watch = new ResizeObserver(resize);
  watch.observe(container);
  resize();

  let lit: number | null = null;
  let frameId = 0;
  let last = performance.now();
  const floats: { sprite: any; born: number; base: any }[] = [];
  // ---------- Your dragon on the middle stone ----------
  const PET_RING = 2.45;
  /** Where on the stone's rim: angle measured like the camera's yaw (HOME_YAW is the front). */
  const petSpot = (angle: number, lift = 0) => new T.Vector3(Math.sin(angle) * PET_RING, TOP + lift, Math.cos(angle) * PET_RING);
  const bubbleOf = (text: string, size = 60) => {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 120;
    const x = c.getContext("2d")!;
    x.fillStyle = "rgba(255,255,255,0.95)";
    x.beginPath();
    x.arc(80, 52, 46, 0, Math.PI * 2);
    x.moveTo(62, 90);
    x.lineTo(56, 116);
    x.lineTo(82, 94);
    x.fill();
    x.font = `${size}px system-ui, sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillStyle = "#1E3A8A";
    x.fillText(text, 80, 54);
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthTest: false }));
    sprite.scale.set(0.8, 0.6, 1);
    sprite.renderOrder = 8;
    sprite.visible = false;
    return sprite;
  };
  type PetMode = "walk" | "rest" | "fly" | "tour" | "sleep" | "happy";
  const ELEMENT_GLOW = [0xffe066, 0xb45cff, 0x9dff6b];
  /** A lap of the whole board: take off, circle over the squares, and land back where it left. */
  const TOUR_MS = 11000, TOUR_RADIUS = 6.1, TOUR_HEIGHT = 2.4;
  let eggTap = () => undefined as void;
  let pet: {
    m: Monster;
    look: PetLook;
    angle: number;
    goal: number;
    mode: PetMode;
    until: number;
    lift: number;
    spin: number;
    tourAt: number;
    food: any;
    zzz: any;
    count: any;
  } | null = null;
  /** The egg's hatching counter, e.g. 23/60, drawn on a little tag. */
  const counterTex = (text: string) => {
    const c = document.createElement("canvas");
    c.width = 192;
    c.height = 72;
    const x = c.getContext("2d")!;
    x.fillStyle = "rgba(30,58,138,0.9)";
    x.beginPath();
    x.moveTo(36, 6);
    x.arcTo(186, 6, 186, 66, 30);
    x.arcTo(186, 66, 6, 66, 30);
    x.arcTo(6, 66, 6, 6, 30);
    x.arcTo(6, 6, 186, 6, 30);
    x.fill();
    x.font = "900 40px system-ui, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillStyle = "#FBD000";
    x.fillText(text, 96, 38);
    return new T.CanvasTexture(c);
  };
  /** Sparkles burst from the lawn when the egg hatches. */
  const sparks: { mesh: any; v: any; born: number }[] = [];
  function hatchBurst(at: any) {
    const colours = [0xffd34d, 0xffffff, ELEMENT_GLOW[pet?.look.element ?? 0]];
    for (let k = 0; k < 40; k++) {
      const m = new T.Mesh(new T.BoxGeometry(0.08, 0.08, 0.08), new T.MeshBasicMaterial({ color: colours[k % 3], transparent: true }));
      m.position.copy(at);
      stone.add(m);
      sparks.push({ mesh: m, v: new T.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 2), born: performance.now() });
    }
  }
  function setPet(look: PetLook | null) {
    if (pet) {
      stone?.remove(pet.m.group);
      pet = null;
    }
    if (!look || !stone) return;
    const m = buildMonster(T, look.element, look.stage, look.legend);
    // About the size of a die on the lawn (the egg a little bigger).
    m.group.scale.setScalar(look.stage === 0 ? 1.5 : m.model ? 1.25 : 0.55);
    stone.add(m.group);
    // The egg sits on the side of the lawn, clear of the GO sign above the middle and the dice at the front.
    const back = HOME_YAW + Math.PI / 2;
    const food = bubbleOf("🍖");
    const zzz = bubbleOf("💤", 54);
    const count = new T.Sprite(new T.SpriteMaterial({ map: counterTex(`${look.rolls ?? 0}/${look.hatchAt ?? 60}`), transparent: true, depthTest: false }));
    count.scale.set(0.9, 0.34, 1);
    count.position.y = m.height + 0.3;
    count.renderOrder = 8;
    count.visible = look.stage === 0 && look.hatchAt !== undefined;
    m.group.add(food, zzz, count);
    food.position.y = m.height + 0.35;
    zzz.position.y = m.height + 0.3;
    pet = { m, look, angle: back, goal: back, mode: "rest", until: performance.now() + 2000, lift: 0, spin: 0, tourAt: 0, food, zzz, count };
    m.group.position.copy(petSpot(back));
    m.group.rotation.y = HOME_YAW;
  }
  function happy() {
    if (!pet || pet.look.stage === 0 || pet.mode === "tour") return;
    pet.mode = "happy";
    pet.until = performance.now() + 1300;
    pet.spin = 0;
  }
  /** Pick what the dragon does next: hungry ones mostly sit and wait for food. */
  function nextMode(now: number) {
    if (!pet) return;
    const r = Math.random();
    const hungry = pet.look.hungry;
    const mode: PetMode = hungry
      ? r < 0.55 ? "rest" : r < 0.85 ? "walk" : "sleep"
      : r < 0.4 ? "walk" : r < 0.6 ? "rest" : r < 0.72 ? "fly" : r < 0.86 ? "tour" : "sleep";
    pet.mode = mode;
    if (mode === "walk") {
      // Anywhere round the back three-quarters of the rim, clear of the dice at the front.
      pet.goal = HOME_YAW + Math.PI * (0.35 + Math.random() * 1.3);
      pet.until = now + 9000;
    } else {
      if (mode === "tour") pet.tourAt = now;
      pet.until = now + (mode === "tour" ? TOUR_MS : mode === "sleep" ? 7000 + Math.random() * 5000 : mode === "fly" ? 2400 : 3000 + Math.random() * 3000);
    }
  }
  function updatePet(now: number, dt: number) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i], age = (now - sp.born) / 1000;
      if (age > 1.2) {
        stone.remove(sp.mesh);
        sparks.splice(i, 1);
        continue;
      }
      sp.v.y -= dt * 3;
      sp.mesh.position.addScaledVector(sp.v, dt);
      sp.mesh.rotation.x += dt * 8;
      sp.mesh.material.opacity = 1 - age / 1.2;
    }
    if (!pet) return;
    pet.m.update(now);
    if (pet.look.stage === 0) return;
    if (now > pet.until) nextMode(now);
    const faceCamera = () => Math.atan2(camera.position.x - pet!.m.group.position.x, camera.position.z - pet!.m.group.position.z);
    let wantYaw = faceCamera();
    let wantLift = 0;
    if (pet.mode === "walk") {
      const delta = pet.goal - pet.angle;
      if (Math.abs(delta) < 0.02) {
        pet.until = 0;
      } else {
        const step = Math.sign(delta) * Math.min(Math.abs(delta), dt * 0.45);
        pet.angle += step;
        // Walk along the rim: face the way it's going.
        wantYaw = pet.angle + (step > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    } else if (pet.mode === "fly") {
      wantLift = 0.9;
    } else if (pet.mode === "happy") {
      pet.spin += dt * 9;
      wantYaw = faceCamera() + pet.spin;
      wantLift = 0.15;
    }
    if (pet.mode === "tour") {
      // Up, a full lap over the squares (the way the tokens go), and back down to where it took off.
      const k = Math.min(1, (now - pet.tourAt) / TOUR_MS);
      const out = Math.min(1, k / 0.15), back = Math.min(1, (1 - k) / 0.15);
      const blend = Math.min(out, back);
      const ease = blend * blend * (3 - 2 * blend);
      const a = pet.angle - k * Math.PI * 2;
      const radius = PET_RING + (TOUR_RADIUS - PET_RING) * ease;
      const height = TOUR_HEIGHT * ease + Math.sin(k * Math.PI * 6) * 0.25 * ease;
      pet.m.group.position.set(Math.sin(a) * radius, TOP + height, Math.cos(a) * radius);
      pet.m.group.rotation.y = a - Math.PI / 2;
      pet.m.setMood("fly");
      pet.food.visible = false;
      pet.zzz.visible = false;
      return;
    }
    pet.lift += (wantLift - pet.lift) * Math.min(1, dt * 3);
    pet.m.group.position.copy(petSpot(pet.angle, pet.lift));
    pet.m.group.rotation.y = pet.mode === "happy" ? wantYaw : turnToward(pet.m.group.rotation.y, wantYaw, dt * 6);
    const mood: Mood = pet.mode;
    pet.m.setMood(mood);
    pet.food.visible = pet.look.hungry && pet.mode === "rest";
    pet.zzz.visible = pet.mode === "sleep";
    if (pet.zzz.visible) pet.zzz.position.x = Math.sin(now / 600) * 0.08;
  }

  // ---------- 龍捲風 (Sky 2026-09-30): a spinning funnel that carries you off ----------
  const BLOW_LIFT = 700, BLOW_FLY = 1000, BLOW_END = BLOW_LIFT + BLOW_FLY + 400;
  const blow = { at: -1e9, from: new T.Vector3(), to: new T.Vector3() };
  const twister = new T.Group();
  {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const x = c.getContext("2d")!;
    x.fillStyle = "rgba(210,222,240,0.35)";
    x.fillRect(0, 0, 256, 128);
    x.strokeStyle = "rgba(255,255,255,0.9)";
    x.lineCap = "round";
    for (let k = 0; k < 9; k++) {
      x.lineWidth = 3 + (k % 3) * 2;
      x.beginPath();
      const y0 = 8 + k * 14;
      x.moveTo(0, y0);
      x.bezierCurveTo(80, y0 - 18, 170, y0 + 18, 256, y0);
      x.stroke();
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(2, 1);
    const mat = new T.MeshBasicMaterial({ map: tex, color: 0xdfe8f7, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide });
    const funnel = new T.Mesh(new T.CylinderGeometry(1.25, 0.18, 3.2, 28, 6, true), mat);
    funnel.position.y = 1.6;
    twister.add(funnel);
    const inner = new T.Mesh(new T.CylinderGeometry(0.9, 0.12, 2.8, 20, 4, true), mat.clone());
    inner.position.y = 1.45;
    twister.add(inner);
    twister.userData = { funnel, inner, tex };
    twister.visible = false;
    scene.add(twister);
  }
  function blowStep(now: number): number {
    // Returns how high your character is lifted (0 when no twister is about).
    const e = now - blow.at;
    if (e < 0 || e > BLOW_END) {
      twister.visible = false;
      return 0;
    }
    const { funnel, inner, tex } = twister.userData;
    twister.visible = true;
    const fadeIn = Math.min(1, e / 250), fadeOut = e > BLOW_LIFT + BLOW_FLY ? 1 - (e - BLOW_LIFT - BLOW_FLY) / 400 : 1;
    funnel.material.opacity = 0.75 * fadeIn * fadeOut;
    inner.material.opacity = 0.55 * fadeIn * fadeOut;
    funnel.rotation.y -= 0.35;
    inner.rotation.y += 0.5;
    tex.offset.x -= 0.03;
    twister.scale.setScalar(0.4 + 0.6 * fadeIn);
    let lift = 0;
    if (e < BLOW_LIFT) {
      ship.position.copy(blow.from);
      lift = (e / BLOW_LIFT) * 1.4;
    } else if (e < BLOW_LIFT + BLOW_FLY) {
      const k = (e - BLOW_LIFT) / BLOW_FLY, ease = k * k * (3 - 2 * k);
      ship.position.lerpVectors(blow.from, blow.to, ease);
      lift = 1.4 + Math.sin(k * Math.PI) * 1.6 - k * 1.4;
    } else {
      ship.position.copy(blow.to);
      lift = 0;
    }
    twister.position.set(ship.position.x, TOP, ship.position.z);
    if (!heroState.ready) ship.position.y += lift;
    // The character twirls while it's up in the air.
    if (heroState.ready && lift > 0.05) hero.rotation.y += 0.45;
    return lift;
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    backdrop.update(now, dt);
    // Islands breathe, each on its own clock.
    if (!reduceMotion) {
      for (const b of breathers) {
        const h = Math.sin((now / 1000 / b.period) * Math.PI * 2 + b.phase) * (b.amp ?? 0.06);
        b.obj.position.y = b.base + h;
        const sc = 1 - (h / (b.amp ?? 0.06)) * 0.1;
        b.shadow?.scale.set(sc, sc, 1);
        if (b.glow) b.glow.position.y = b.glowY + h;
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
    const blowing = now - blow.at >= 0 && now - blow.at <= BLOW_LIFT + BLOW_FLY;
    const lift = blowStep(now);
    if (blowing) {
      // The twister has the character.
    } else if (shipAt.t < 1) {
      shipAt.t = Math.min(1, shipAt.t + dt / 0.22);
      ship.position.lerpVectors(shipAt.from, shipAt.to, shipAt.t);
      ship.position.y += Math.sin(shipAt.t * Math.PI) * 0.3;
    } else {
      ship.position.y = shipAt.to.y + Math.sin(now / 900) * 0.07;
    }
    ship.rotation.z = Math.sin(now / 1100) * 0.05;
    ship.rotation.y += dt * 0.25;
    // A burst of flame on each take-off, then just a small pilot light.
    const burn = Math.max(0, 1 - (now - burnAt) / 450);
    const flick = 0.85 + Math.random() * 0.3;
    flame.scale.set(1 + burn, (0.35 + burn * 1.4) * flick, 1 + burn);
    flame.position.y = 0.2 + (0.35 + burn * 1.4) * 0.11;
    flameGlow.material.opacity = burn * 0.9;
    // Your character walks square to square on top of the (breathing) islands.
    if (heroState.ready) {
      const k = shipAt.t;
      const fromIsle = islands[shipAt.fromIndex], toIsle = islands[shipAt.index];
      const groundY = (fromIsle?.group.position.y ?? 0) * (1 - k) + (toIsle?.group.position.y ?? 0) * k;
      hero.position.set(ship.position.x, TOP + groundY + Math.sin(k * Math.PI) * 0.12 + lift, ship.position.z);
      heroState.mixer.update(dt);
      const moving = k < 1;
      if (moving) {
        heroState.still = 0;
        if (!heroState.cheering) heroState.walk.paused = false;
        const want = Math.atan2(shipAt.to.x - shipAt.from.x, shipAt.to.z - shipAt.from.z);
        if (!blowing) hero.rotation.y = turnToward(hero.rotation.y, want, dt * 14);
      } else {
        heroState.still += dt;
        if (heroState.still > 0.25 && !heroState.cheering) {
          heroState.walk.paused = true;
          heroState.walk.time = 0;
        }
        // Standing still: turn to face the camera.
        if (heroState.still > 0.5) hero.rotation.y = turnToward(hero.rotation.y, Math.atan2(camera.position.x - hero.position.x, camera.position.z - hero.position.z), dt * 5);
      }
    }
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
    // The board stays put (no drifting after the ship), so the GO stone below it never gets covered.
    const sway = reduceMotion ? 0 : Math.sin(now / 7000) * 0.12 * Math.min(1, Math.max(0, view.idle - 2) / 3);
    const yaw = view.yaw + sway, flat = Math.cos(view.elev) * view.dist;
    camera.position.set(target.x + Math.sin(yaw) * flat, target.y + Math.sin(view.elev) * view.dist, target.z + Math.cos(yaw) * flat);
    camera.lookAt(target);
    // The rune: glows and pulses on your go; the stone dips a little when tapped.
    rune.level += ((rune.ready ? 1 : 0) - rune.level) * Math.min(1, dt * 4);
    const pulse = rune.level * (0.75 + 0.25 * Math.sin(now / 420));
    // The waiting dice glow gold with the pulse.
    for (const m of dieMats) m.emissiveIntensity = pulse * 0.55;
    runeRing.material.opacity = pulse * 0.22;
    runeLight.intensity = pulse * 0.6;
    goGlow.material.opacity = pulse;
    const press = Math.max(0, 1 - (now - rune.pressAt) / 260);
    goStone.children[0].position.y = -Math.sin(press * Math.PI) * 0.2 + (reduceMotion ? 0 : Math.sin(now / 1500) * 0.08);
    // Dice: drop from above the rune, bounce twice while spinning down to their faces, then sit.
    updatePet(now, dt);
    for (const d of dice) {
      if (d.idle) {
        // No dice on the board until you roll (Sky 2026-09-30).
        d.mesh.visible = false;
        continue;
      }
      if (!d.mesh.visible) {
        d.idle = true;
        d.back = now;
        continue;
      }
      // Up out of the GO stone in a high arc, down onto the middle stone, then two little bounces.
      const t = Math.max(0, Math.min(1, (now - d.born) / 1300));
      const FLY = 0.6;
      if (t < FLY) {
        const f = t / FLY;
        d.mesh.position.lerpVectors(d.from, d.rest, f);
        d.mesh.position.y += Math.sin(f * Math.PI) * 4.5 + (1 - f) * 0;
      } else {
        d.mesh.position.copy(d.rest);
        const b = (t - FLY) / (1 - FLY);
        d.mesh.position.y += b < 0.55 ? 0.6 * Math.sin((b / 0.55) * Math.PI) : 0.15 * Math.sin(((b - 0.55) / 0.45) * Math.PI);
      }
      const left = Math.pow(1 - t, 2) * 12;
      d.mesh.quaternion.copy(d.q);
      if (left > 0) d.mesh.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(d.spin, left));
      const out = d.fade > 0 ? Math.min(1, (now - d.fade) / 400) : 0;
      d.mesh.scale.setScalar(Math.max(0, Math.min(1, (now - d.born) / 120)) * (1.3 + 0.3 * (1 - t)) - out);
      if (out >= 1) d.mesh.visible = false;
    }
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  return {
    blowTo(index) {
      if (index === shipAt.index) return;
      blow.at = performance.now();
      blow.from.copy(ship.position);
      blow.to.copy(spotOf(index));
      shipAt.fromIndex = shipAt.index;
      shipAt.index = index;
      shipAt.from.copy(blow.to);
      shipAt.to.copy(blow.to);
      shipAt.t = 1;
    },
    moveTo(index) {
      if (index === shipAt.index) return;
      shipAt.fromIndex = shipAt.index;
      shipAt.index = index;
      shipAt.from.copy(ship.position);
      shipAt.to.copy(spotOf(index));
      shipAt.t = 0;
      burnAt = performance.now();
    },
    cheer() {
      if (!heroState.ready || !heroState.cheer) return;
      heroState.cheering = true;
      heroState.walk.paused = false;
      heroState.cheer.reset();
      heroState.cheer.play();
      heroState.walk.crossFadeTo(heroState.cheer, 0.2, false);
    },
    throwDice(faces) {
      const now = performance.now();
      const up = new T.Vector3(0, 1, 0);
      dice.forEach((d, k) => {
        // Turn the face showing the roll to the top, then a random turn about the up axis.
        d.q.copy(faceUp(faces[k])).premultiply(new T.Quaternion().setFromAxisAngle(up, (Math.random() - 0.5) * 0.8));
        d.spin.set(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize();
        // They leap out of the GO stone and land in the middle of the board.
        goStone.updateMatrixWorld(true);
        d.from.copy(goStone.children[0].localToWorld(new T.Vector3((k ? 0.45 : -0.45), TOP + 0.4, 0)));
        stone.updateMatrixWorld(true);
        stone.worldToLocal(d.from);
        d.born = now + k * 90;
        d.fade = -1e9;
        d.idle = false;
        d.mesh.visible = true;
      });
    },
    clearDice() {
      const now = performance.now();
      for (const d of dice) if (!d.idle && d.mesh.visible && d.fade < 0) d.fade = now;
    },
    setPet(look) {
      if (look && pet && pet.look.element === look.element && pet.look.stage === look.stage && pet.look.legend === look.legend) {
        if (look.stage === 0 && look.rolls !== pet.look.rolls) {
          pet.count.material.map.dispose();
          pet.count.material.map = counterTex(`${look.rolls ?? 0}/${look.hatchAt ?? 60}`);
          pet.count.material.needsUpdate = true;
          pet.count.visible = look.hatchAt !== undefined;
        }
        pet.look = look;
        return;
      }
      // Hatching: the new dragon pops out where the egg was, in a burst of sparkles.
      const wasEgg = pet && pet.look.stage === 0 && look && look.stage > 0;
      const at = pet ? pet.m.group.position.clone() : null;
      const angle = pet?.angle;
      setPet(look);
      if (wasEgg && pet && at && angle !== undefined) {
        pet.angle = angle;
        pet.goal = angle;
        pet.m.group.position.copy(at);
        hatchBurst(at.clone().setY(TOP + 0.6));
        happy();
      }
    },
    petHappy() {
      happy();
    },
    onEggTap(handler) {
      eggTap = handler;
    },
    setReady(ready) {
      rune.ready = ready;
    },
    highlight(index) {
      lit = index;
    },
    floatText(text, colour = "#16A34A") {
      // Sky: no numbers over the hero at all — the big picture in the middle of the screen shows what you got.
      if (NO_FLOATS) return;
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
      floats.push({ sprite, born: performance.now(), base: heroState.ready ? hero.position.clone().add(new T.Vector3(0, HERO_HEIGHT + 0.2, 0)) : ship.position.clone() });
    },
    recentre() {
      view.goalYaw = HOME_YAW;
      view.goalElev = BOARD_ELEV;
      view.goalDist = fitDist;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
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
}
