/**
 * 第一層 每日棋盤 in 3D: the 28 squares as floating islands in a diamond ring, each labelled in
 * words, a big stone island in the middle with GO carved in it as a glowing rune (tap it to roll),
 * and you as your chosen 3D character walking round (a hot-air balloon until the model loads). Same floating look and camera as the public
 * table: drag to turn and tilt, pinch to zoom, a gentle sway when left alone.
 */
import { ACTORS, loadGltfLoader } from "@/components/eight-scene";
import { BOARD_SIZE, TILES, type TileKind } from "@/lib/board";

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
  /** Throw two small dice onto the middle stone; they tumble and settle showing these faces. */
  throwDice(faces: [number, number]): void;
  /** Fade the dice away (the walk is over). */
  clearDice(): void;
  /** Put the camera back over the whole board. */
  recentre(): void;
  dispose(): void;
};

const SIDE = BOARD_SIZE / 4; // 7 steps between corners
const PITCH = 1.45;
const R = (SIDE * PITCH) / Math.SQRT2;
const TOP = 0.34;
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
  tax: 0x8b5cf6,
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
    // Neighbours are well out of step (golden-angle phases), so some rise while others sink.
    breathers.push({ obj: isle.group, phase: i * 2.39996 + Math.random() * 0.4, period: 4.2 + Math.random() * 1.6, shadow, glow, base: 0, glowY: TOP - 1.2, amp: 0.08 });
    islands.push({ group: isle.group, top: isle.top, base: TOPS[tile.kind], glow, tag });
  });
  // The main island in the middle: a big stone with GO carved in as a rune. Tap it to roll;
  // the rune glows when it's your go. Open air between it and the ring of squares.
  const bigRock = new T.Group();
  const dice: { mesh: any; rest: any; from: any; q: any; spin: any; born: number; fade: number }[] = [];
  const rune = { ready: false, level: 0, pressAt: -1e9 };
  let runeGlow: any, runeLight: any, runeRing: any;
  {
    const big = islandMesh(6, 977, 0x9aa1ab);
    big.top.material.roughness = 0.95;
    big.group.position.set(0, 0.1, 0);
    bigRock.add(big.group);
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
    plate(carve(false), false);
    runeGlow = plate(carve(true), true);
    runeRing = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffc860, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
    runeRing.scale.set(5, 2.2, 1);
    runeRing.position.y = TOP + 0.4;
    big.group.add(runeRing);
    runeLight = new T.PointLight(0xffc060, 0, 7, 2);
    runeLight.position.y = TOP + 1;
    big.group.add(runeLight);
    // A few crystals round the rim.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 1.41, h = 0.35 + (k % 2) * 0.2;
      const gem = shadowy(new T.Mesh(new T.OctahedronGeometry(0.18, 0), mat(0x7dd3fc, 0.2, { emissive: 0x1e6fa8, emissiveIntensity: 0.6 })));
      gem.scale.y = h / 0.18;
      gem.position.set(Math.cos(a) * 2.75, TOP + h * 0.8, Math.sin(a) * 2.75);
      big.group.add(gem);
    }
    // Two small dice that land on the front edge of the stone, clear of the rune.
    const pipTex = (v: number) => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const x = c.getContext("2d")!;
      x.fillStyle = "#fffdf5";
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = "#e7dcc0";
      x.lineWidth = 8;
      x.strokeRect(4, 4, 120, 120);
      const at: Record<number, [number, number][]> = {
        1: [[64, 64]],
        2: [[36, 36], [92, 92]],
        3: [[34, 34], [64, 64], [94, 94]],
        4: [[36, 36], [92, 36], [36, 92], [92, 92]],
        5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]],
        6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]],
      };
      x.fillStyle = v === 1 ? "#e52521" : "#1f2937";
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
    const dieMats = faceValues.map((v) => new T.MeshStandardMaterial({ map: pipTex(v), roughness: 0.4 }));
    for (let k = 0; k < 2; k++) {
      const die = shadowy(new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.5), dieMats));
      die.visible = false;
      big.group.add(die);
      const a = Math.PI / 4 + (k ? 0.24 : -0.24);
      dice.push({ mesh: die, rest: new T.Vector3(Math.cos(a) * 2.35, TOP + 0.25, Math.sin(a) * 2.35), from: new T.Vector3(), q: new T.Quaternion(), spin: new T.Vector3(), born: -1e9, fade: -1e9 });
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

  // ---------- Far away: the abyss and distant rocks, drifting slower than the board ----------
  const far = new T.Group();
  scene.add(far);
  {
    const n = 500, sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(1 - Math.random() * 1.2), rr = 70 + Math.random() * 20;
      sp[i * 3] = Math.sin(v) * Math.cos(u) * rr;
      sp[i * 3 + 1] = Math.cos(v) * rr - 20;
      sp[i * 3 + 2] = Math.sin(v) * Math.sin(u) * rr;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(sp, 3));
    far.add(new T.Points(geo, new T.PointsMaterial({ size: 0.5, map: glowTex, color: 0xdbe8ff, transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending })));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + Math.random() * 0.3, d = 26 + Math.random() * 14;
      const rock = islandMesh(1.5 + Math.random() * 2.5, 900 + k * 7, 0x3f6b4a);
      rock.group.position.set(Math.cos(a) * d, -6 + Math.random() * 9, Math.sin(a) * d);
      far.add(rock.group);
    }
    // A faint glow deep in the abyss.
    const deep = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0x3b6fd0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.35, fog: false }));
    deep.scale.set(60, 30, 1);
    deep.position.set(0, -30, 0);
    far.add(deep);
  }
  const floor = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ color: 0x0c1528, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  floor.receiveShadow = false;
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
  const view = { yaw: HOME_YAW, elev: 0.9, goalYaw: HOME_YAW, goalElev: 0.9, dist: 20, goalDist: 20, idle: 0 };
  const target = new T.Vector3();
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
      view.goalElev = Math.max(0.35, Math.min(1.35, view.goalElev + (e.clientY - before.y) * 0.004));
    } else {
      const other = pts.find((p) => p !== before)!;
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (was > 1 && is > 1) view.goalDist = Math.max(6, Math.min(45, view.goalDist * (was / is)));
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
    if (ray.intersectObject(bigRock, true).length === 0) return;
    rune.pressAt = performance.now();
    if (rune.ready) onGo();
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    view.goalDist = Math.max(6, Math.min(45, view.goalDist * Math.exp(e.deltaY * 0.0012)));
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
    if (shipAt.t < 1) {
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
      hero.position.set(ship.position.x, TOP + groundY + Math.sin(k * Math.PI) * 0.12, ship.position.z);
      heroState.mixer.update(dt);
      const moving = k < 1;
      if (moving) {
        heroState.still = 0;
        if (!heroState.cheering) heroState.walk.paused = false;
        const want = Math.atan2(shipAt.to.x - shipAt.from.x, shipAt.to.z - shipAt.from.z);
        hero.rotation.y = turnToward(hero.rotation.y, want, dt * 14);
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
    // The label of the square you stand on lifts above your head so it stays readable.
    islands.forEach((isle, i) => {
      const want = heroState.ready && i === shipAt.index ? TOP + HERO_HEIGHT + 0.45 : TOP + 0.55;
      isle.tag.position.y += (want - isle.tag.position.y) * Math.min(1, dt * 8);
    });
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
    target.lerp(new T.Vector3(ship.position.x * 0.3, 0, ship.position.z * 0.3), Math.min(1, dt * 1.5));
    const sway = reduceMotion ? 0 : Math.sin(now / 7000) * 0.12 * Math.min(1, Math.max(0, view.idle - 2) / 3);
    const yaw = view.yaw + sway, flat = Math.cos(view.elev) * view.dist;
    camera.position.set(target.x + Math.sin(yaw) * flat, Math.sin(view.elev) * view.dist, target.z + Math.cos(yaw) * flat);
    camera.lookAt(target);
    // The far layer turns along with the camera by half, so it seems to drift at half the speed.
    far.rotation.y = yaw * 0.5;
    far.position.y = (view.elev - 0.9) * 6;
    // The rune: glows and pulses on your go; the stone dips a little when tapped.
    rune.level += ((rune.ready ? 1 : 0) - rune.level) * Math.min(1, dt * 4);
    const pulse = rune.level * (0.75 + 0.25 * Math.sin(now / 420));
    runeGlow.material.opacity = 0.05 + pulse * 0.5;
    runeRing.material.opacity = pulse * 0.18;
    runeLight.intensity = pulse * 0.45;
    const press = Math.max(0, 1 - (now - rune.pressAt) / 260);
    bigRock.position.y = -Math.sin(press * Math.PI) * 0.18;
    // Dice: drop from above the rune, bounce twice while spinning down to their faces, then sit.
    for (const d of dice) {
      if (!d.mesh.visible) continue;
      const t = Math.max(0, Math.min(1, (now - d.born) / 900));
      const k = 1 - Math.pow(1 - t, 2);
      d.mesh.position.lerpVectors(d.from, d.rest, k);
      const hop = t < 0.45 ? 2.6 * (1 - t / 0.45) * (1 - t / 0.45) : t < 0.75 ? 0.45 * Math.sin(((t - 0.45) / 0.3) * Math.PI) : 0.12 * Math.sin(((t - 0.75) / 0.25) * Math.PI);
      d.mesh.position.y = d.rest.y + hop;
      const left = Math.pow(1 - t, 2) * 9;
      d.mesh.quaternion.copy(d.q);
      if (left > 0) d.mesh.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(d.spin, left));
      const out = d.fade > 0 ? Math.min(1, (now - d.fade) / 400) : 0;
      d.mesh.scale.setScalar(1 - out);
      if (out >= 1) d.mesh.visible = false;
    }
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  return {
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
        const v = faces[k];
        // Turn the face showing v to the top, then a random turn about the up axis.
        const base = new T.Quaternion();
        if (v === 6) base.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI);
        else if (v === 2) base.setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
        else if (v === 5) base.setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
        else if (v === 3) base.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2);
        else if (v === 4) base.setFromAxisAngle(new T.Vector3(0, 0, 1), -Math.PI / 2);
        d.q.copy(base).premultiply(new T.Quaternion().setFromAxisAngle(up, (Math.random() - 0.5) * 0.8));
        d.spin.set(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize();
        d.from.set(k ? 0.35 : -0.35, TOP + 0.25, k ? -0.2 : 0.2);
        d.born = now + k * 90;
        d.fade = -1e9;
        d.mesh.scale.setScalar(1);
        d.mesh.visible = true;
      });
    },
    clearDice() {
      const now = performance.now();
      for (const d of dice) if (d.mesh.visible && d.fade < 0) d.fade = now;
    },
    setReady(ready) {
      rune.ready = ready;
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
      floats.push({ sprite, born: performance.now(), base: heroState.ready ? hero.position.clone().add(new T.Vector3(0, HERO_HEIGHT + 0.2, 0)) : ship.position.clone() });
    },
    recentre() {
      view.goalYaw = HOME_YAW;
      view.goalElev = 0.9;
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
