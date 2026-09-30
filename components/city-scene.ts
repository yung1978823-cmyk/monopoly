/**
 * A town page in 3D: one big floating island for the theme, five building plots round a centre
 * piece, and each building drawn in the theme's own style at its level (1 small → 5 landmark).
 * Used for your own town (tap a plot to build) and a rival's town (tap a building to strike).
 * Drag left and right to turn the island; the tilt and distance stay fixed.
 */
import { createBackdrop, createSea } from "@/components/backdrop";
import { buildMonster, type Monster } from "@/components/monster";
import { themeOf, type Theme } from "@/lib/themes";

export type MonsterLook = { element: number; stage: number; legend?: boolean };

export type CityScene = {
  /** Redraw the buildings at these levels; `pop` makes that building spring up with sparkles. */
  setLevels(levels: readonly number[], pop?: number | null): void;
  /** Show pulsing target rings on the standing buildings (attack) or not. */
  setTargets(on: boolean): void;
  /** Knock a building down with a shake and flying rubble (its new level comes with setLevels). */
  smash(index: number): void;
  /** Your monster (the attacker) swoops onto a building and back. */
  lunge(index: number): void;
  /** The attacker breathes a fireball at building `index` (null: the middle of the island). `smash`: it blows up
   *  (the lower level arrives with setLevels); `block`: a shield stops it; `break`: it shatters a shield, then blows up;
   *  `hit`: it blows up on the ground. It lands FIRE_MS after the call. */
  fire(index: number | null, result: "smash" | "block" | "break" | "hit"): void;
  /** Fireworks over the whole island (a page finished). */
  celebrate(): void;
  dispose(): void;
};

const TOP = 0.3;
/** How long the fireball flies before it lands (the attack screen times its sounds to this). */
export const FIRE_MS = 700;
const PLOTS = 5;
/** Plot centres: a ring of five round the middle piece, the first at the front. */
const PLOT_AT: [number, number][] = Array.from({ length: PLOTS }, (_, i) => {
  const a = Math.PI / 2 + (i / PLOTS) * Math.PI * 2 + Math.PI / 4;
  return [Math.cos(a) * 2.75, Math.sin(a) * 2.75];
});
const HOME_YAW = Math.PI / 4;
/** Where the camera aims: below the island top, so the island sits high and clear of the cards below. */
const AIM_Y = -0.7;
/** Your attacking monster turns its back (a three-quarter view) toward the town it strikes. */
const ATTACK_YAW = HOME_YAW + Math.PI - 0.55;

export function createCityScene(
  T: any,
  container: HTMLElement,
  themeIndex: number,
  levels: readonly number[],
  onPick: (index: number) => void = () => undefined,
  who: { resident?: MonsterLook | null; attacker?: MonsterLook | null } = {},
): CityScene {
  const theme: Theme = themeOf(themeIndex);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new T.Scene();
  {
    const sky = document.createElement("canvas");
    sky.width = 4;
    sky.height = 256;
    const g = sky.getContext("2d")!, grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, theme.sky);
    grad.addColorStop(0.6, "#1d3560");
    grad.addColorStop(1, "#0b1428");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new T.CanvasTexture(sky);
    tex.encoding = T.sRGBEncoding;
    scene.background = tex;
  }
  scene.fog = new T.Fog(0x12203d, 30, 90);
  const camera = new T.PerspectiveCamera(38, 1, 0.1, 300);
  scene.add(new T.HemisphereLight(0xe6eeff, 0x1a2238, 0.9));
  const sun = new T.DirectionalLight(0xfff0d0, 1.25);
  sun.position.set(-6, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
  scene.add(sun);

  // Colours are written as sRGB; the renderer outputs sRGB, so convert them or everything looks washed out.
  const lin = (hex: number) => new T.Color(hex).convertSRGBToLinear();
  const mat = (color: number, rough = 0.7, extra: object = {}) => {
    const m = new T.MeshStandardMaterial(Object.assign({ roughness: rough }, extra));
    m.color = lin(color);
    if ((extra as any).emissive !== undefined) m.emissive = lin((extra as any).emissive);
    return m;
  };
  const flat = (color: number) => new T.MeshStandardMaterial({ color: lin(color), roughness: 0.9, flatShading: true });
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
  const box = (w: number, h: number, d: number, color: number, y = 0, x = 0, z = 0) => {
    const m = shadowy(new T.Mesh(new T.BoxGeometry(w, h, d), mat(color)));
    m.position.set(x, y + h / 2, z);
    return m;
  };
  /** A four-sided roof (pyramid), `w` across, `h` tall, sitting at y. */
  const hipRoof = (w: number, h: number, color: number, y: number) => {
    const m = shadowy(new T.Mesh(new T.ConeGeometry(w * 0.72, h, 4), mat(color, 0.6)));
    m.rotation.y = Math.PI / 4;
    m.position.y = y + h / 2;
    return m;
  };
  const dome = (r: number, color: number, y: number) => {
    const m = shadowy(new T.Mesh(new T.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, 0.45)));
    m.position.y = y;
    return m;
  };
  /** Rows of dark windows round a block. */
  const windows = (g: any, w: number, floors: number, floorH: number, y0: number) => {
    const wm = mat(0x2b3a55, 0.3, { emissive: 0x3a5a8a, emissiveIntensity: 0.25 });
    for (let f = 0; f < floors; f++) {
      for (const side of [0, 1, 2, 3]) {
        const pane = new T.Mesh(new T.BoxGeometry(w * 0.5, floorH * 0.38, 0.02), wm);
        const a = (side * Math.PI) / 2;
        pane.position.set(Math.sin(a) * (w / 2 + 0.011), y0 + floorH * (f + 0.55), Math.cos(a) * (w / 2 + 0.011));
        pane.rotation.y = a;
        g.add(pane);
      }
    }
  };

  // ---------- The buildings, by theme and level ----------
  /** A picture building (art themes): stands up facing the camera, feet on the plot. */
  const artTex = new Map<string, any>();
  const ART_UNIT = 1.7 / 300;
  /** Higher levels stand taller still, so level 5 looks grand. */
  const ART_GROW = [1, 1, 1.05, 1.12, 1.3];
  function artBuilding(i: number, level: number): any {
    const art = theme.art!, name = art.names[i], [pw, ph] = art.sizes[name][level - 1], k = ART_GROW[level - 1];
    const w = pw * k, h = ph * k;
    const url = `${art.dir}/${name}${level}.webp`;
    let tex = artTex.get(url);
    if (!tex) {
      tex = new T.TextureLoader().load(url);
      tex.encoding = T.sRGBEncoding;
      artTex.set(url, tex);
    }
    const g = new T.Group();
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.2 }));
    s.center.set(0.5, 0.04);
    s.scale.set(w * ART_UNIT, h * ART_UNIT, 1);
    g.add(s);
    const blob = new T.Mesh(new T.PlaneGeometry(w * ART_UNIT * 1.05, w * ART_UNIT * 0.8), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.01;
    g.add(blob);
    if (art.lamp?.name === name && level >= 4) {
      const [lu, lv] = art.lamp.at[level - 4];
      const glow = new T.Sprite(new T.SpriteMaterial({ map: lampTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xfff0b0 }));
      glow.userData.off = [(lu - 0.5) * w * ART_UNIT, (1 - lv - 0.04) * h * ART_UNIT];
      glow.userData.lamp = true;
      g.add(glow);
      lamps.push(glow);
    }
    if (art.spin?.name === name && level >= 4) {
      const [su, sv, sd] = art.spin.at[level - 4];
      let bt = artTex.get(art.spin.url);
      if (!bt) {
        bt = new T.TextureLoader().load(art.spin.url);
        bt.encoding = T.sRGBEncoding;
        artTex.set(art.spin.url, bt);
      }
      const sails = new T.Sprite(new T.SpriteMaterial({ map: bt, transparent: true, alphaTest: 0.2 }));
      sails.renderOrder = 1;
      sails.userData.off = [(su - 0.5) * w * ART_UNIT, (1 - sv - 0.04) * h * ART_UNIT];
      sails.scale.setScalar(sd * k * ART_UNIT);
      sails.userData.spin = true;
      g.add(sails);
      spinners.push(sails);
    }
    return g;
  }
  const spinners: any[] = [];
  // The building pictures always face the camera, so a windmill's sails or a lighthouse lamp have to be pinned
  // to the picture on screen (camera right / up), not to the plot: pinned to the plot they slid off the hub as
  // the island turned (Sky: 風葉唔啱位置).
  const camRight = new T.Vector3(), camUp = new T.Vector3(), camBack = new T.Vector3(), pinAt = new T.Vector3(), pinScale = new T.Vector3();
  function pinToPicture() {
    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    camBack.setFromMatrixColumn(camera.matrixWorld, 2);
    for (const o of [...spinners, ...lamps]) {
      const [dx, dy] = o.userData.off as [number, number];
      const parent = o.parent;
      if (!parent) continue;
      parent.updateMatrixWorld();
      parent.getWorldScale(pinScale);
      pinAt.setFromMatrixPosition(parent.matrixWorld)
        .addScaledVector(camRight, dx * pinScale.x)
        .addScaledVector(camUp, dy * pinScale.y)
        .addScaledVector(camBack, 0.08 * pinScale.x);
      o.position.copy(parent.worldToLocal(pinAt));
    }
  }
  const lampTex = soft("rgba(255,255,255,1)", "rgba(255,255,255,0)");
  const lamps: any[] = [];

  function building(level: number, i = 0): any {
    if (theme.art && level > 0) return artBuilding(i, level);
    const g = new T.Group();
    if (level <= 0) {
      // An empty plot: a paved pad with a dashed ring.
      const pad = shadowy(new T.Mesh(new T.CylinderGeometry(0.62, 0.66, 0.08, 20), flat(0xb9b2a3)));
      pad.position.y = 0.04;
      g.add(pad);
      return g;
    }
    const s = theme.style;
    if (s === "site") {
      if (level === 1) {
        g.add(box(0.8, 0.5, 0.7, theme.wall));
        g.add(hipRoof(0.95, 0.42, theme.roof, 0.5));
        g.add(box(0.18, 0.3, 0.02, 0x8b5a2b, 0, 0, 0.36));
      } else {
        const floors = [0, 0, 2, 3, 5, 6][level];
        const w = level >= 4 ? 0.8 : 0.95;
        const fh = 0.34;
        g.add(box(w, floors * fh, w, level >= 4 ? 0xdfe7ef : theme.wall));
        windows(g, w, floors, fh, 0);
        if (level <= 3) g.add(hipRoof(w, 0.35, theme.roof, floors * fh));
        else g.add(box(w * 0.7, 0.12, w * 0.7, theme.trim, floors * fh));
        if (level === 5) {
          const spire = shadowy(new T.Mesh(new T.ConeGeometry(0.12, 0.7, 8), mat(0xffd34d, 0.3, { metalness: 0.6 })));
          spire.position.y = floors * fh + 0.12 + 0.35;
          g.add(spire);
        }
      }
    } else if (s === "oriental") {
      // Pagodas: one more roof tier per level, red posts, blue tiles, a gold tip at the top level.
      const tiers = level;
      let y = 0;
      g.add(box(1.0, 0.1, 1.0, 0x9b8b7a));
      y = 0.1;
      for (let k = 0; k < tiers; k++) {
        const w = 0.78 - k * 0.09;
        const h = k === 0 ? 0.38 : 0.28;
        g.add(box(w, h, w, k === 0 ? theme.wall : 0xe8d3b0, y));
        for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.add(box(0.05, h, 0.05, theme.trim, y, (px * w) / 2, (pz * w) / 2));
        y += h;
        const eave = shadowy(new T.Mesh(new T.ConeGeometry(w * 0.95, 0.22, 4, 1, true), mat(theme.roof, 0.55, { side: T.DoubleSide })));
        eave.rotation.y = Math.PI / 4;
        eave.position.y = y + 0.06;
        g.add(eave);
        y += 0.1;
      }
      const tip = shadowy(new T.Mesh(new T.ConeGeometry(0.06, 0.3, 8), mat(level === 5 ? 0xffd34d : theme.roof, 0.4)));
      tip.position.y = y + 0.18;
      g.add(tip);
      if (level >= 3) {
        for (const x of [-0.5, 0.5]) {
          const lamp = new T.Mesh(new T.SphereGeometry(0.07, 10, 8), mat(0xe53935, 0.5, { emissive: 0xff5a36, emissiveIntensity: 0.6 }));
          lamp.position.set(x, 0.42, 0.52);
          g.add(lamp);
        }
      }
    } else {
      // Desert: mud-brick blocks and domes; more blocks, towers and a gold dome as it grows.
      const blocks: [number, number, number, number][] = [
        [0.7, 0.45, 0, 0],
        [0.45, 0.35, 0.42, -0.2],
        [0.55, 0.3, -0.35, 0.3],
      ];
      const count = Math.min(3, Math.ceil(level / 1.5));
      for (let k = 0; k < count; k++) {
        const [w, h, x, z] = blocks[k];
        g.add(box(w, h * (level >= 4 && k === 0 ? 1.6 : 1), w, theme.wall, 0, x, z));
      }
      const mainH = 0.45 * (level >= 4 ? 1.6 : 1);
      g.add(dome(level >= 3 ? 0.36 : 0.26, level === 5 ? 0xffd34d : level >= 3 ? theme.trim : theme.wall, mainH));
      if (level >= 4) {
        for (const x of level === 5 ? [-0.45, 0.45] : [0.45]) {
          const tower = box(0.14, 1.2, 0.14, theme.wall, 0, x, -0.35);
          g.add(tower);
          const cap = dome(0.1, theme.trim, 1.2);
          cap.position.x = x;
          cap.position.z = -0.35;
          g.add(cap);
        }
      }
      if (level >= 2) {
        const door = box(0.16, 0.24, 0.02, 0x6b4a2b, 0, 0, 0.36);
        g.add(door);
      }
    }
    return g;
  }

  // ---------- The island ----------
  const island = new T.Group();
  scene.add(island);
  {
    let seed = 4242 + themeIndex * 17;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
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
    const top = shadowy(new T.Mesh(rough(new T.CylinderGeometry(4.2, 4.35, 0.3, 12), 0.15), mat(theme.ground, 0.85)));
    top.position.y = TOP - 0.15;
    island.add(top);
    const soil = shadowy(new T.Mesh(rough(new T.CylinderGeometry(4.35, 3.7, 0.5, 12), 0.2), flat(0x7a5230)));
    soil.position.y = TOP - 0.55;
    island.add(soil);
    const rock = shadowy(new T.Mesh(rough(new T.CylinderGeometry(3.7, 2.8, 2.2, 11, 2), 0.3), flat(theme.rock)));
    rock.position.y = TOP - 1.9;
    island.add(rock);
    const cap = shadowy(new T.Mesh(rough(new T.SphereGeometry(2.8, 11, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0.25), flat(theme.rock)));
    cap.scale.y = 0.5;
    cap.position.y = TOP - 3;
    island.add(cap);
    // A path ring joining the plots.
    const path = new T.Mesh(new T.RingGeometry(2.45, 3.05, 40), mat(0xd9c9a3, 0.95));
    path.rotation.x = -Math.PI / 2;
    path.position.y = TOP + 0.03;
    path.receiveShadow = true;
    island.add(path);
    // The centre piece, by theme.
    // The theme's centre piece sits a little back and smaller when a monster lives in the middle.
    const mid = new T.Group();
    mid.position.y = TOP;
    if (who.resident) {
      mid.scale.setScalar(0.62);
      mid.position.x = -Math.sin(HOME_YAW) * 1.05;
      mid.position.z = -Math.cos(HOME_YAW) * 1.05;
    }
    island.add(mid);
    if (theme.art) {
      // Picture pages keep the middle clear (no disc or ring behind the dragon — Sky).
    } else if (theme.style === "site") {
      mid.add(box(0.2, 2.4, 0.2, 0xfbd000));
      const jib = box(2.2, 0.14, 0.14, 0xfbd000, 2.4, 0.7, 0);
      mid.add(jib);
      mid.add(box(0.35, 0.3, 0.35, 0x444c56, 2.1, -0.35, 0));
      const hook = box(0.04, 0.8, 0.04, 0x333333, 1.6, 1.6, 0);
      mid.add(hook);
      for (const [x, z, c] of [[0.7, 0.6, 0xe8792b], [-0.6, 0.7, 0x3b82f6], [0.5, -0.8, 0x22c55e]] as const) mid.add(box(0.45, 0.35, 0.45, c, 0, x, z));
    } else if (theme.style === "oriental") {
      // A red gate and two stone lanterns.
      for (const x of [-0.7, 0.7]) mid.add(box(0.14, 1.4, 0.14, theme.trim, 0, x, 0));
      mid.add(box(1.9, 0.14, 0.24, theme.trim, 1.25));
      mid.add(box(2.2, 0.12, 0.3, theme.roof, 1.45));
      for (const x of [-1.2, 1.2]) {
        mid.add(box(0.2, 0.5, 0.2, 0x9aa1ab, 0, x, 0.7));
        const lamp = new T.Mesh(new T.SphereGeometry(0.12, 10, 8), mat(0xffe08a, 0.5, { emissive: 0xffb020, emissiveIntensity: 0.7 }));
        lamp.position.set(x, 0.62, 0.7);
        mid.add(lamp);
      }
      for (const [x, z] of [[-0.4, -0.9], [0.5, -0.8]]) {
        const tree = shadowy(new T.Mesh(new T.SphereGeometry(0.4, 10, 8), mat(0xe58fb2, 0.8)));
        tree.position.set(x, 0.9, z);
        mid.add(tree);
        mid.add(box(0.08, 0.6, 0.08, 0x6b4a2b, 0, x, z));
      }
    } else {
      // An oasis pool with palms.
      const pool = new T.Mesh(new T.CircleGeometry(1.2, 28), mat(0x2bb3c0, 0.15, { emissive: 0x0e6f7a, emissiveIntensity: 0.3 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.02;
      mid.add(pool);
      for (const [x, z] of [[-1.3, 0.3], [1.1, -0.7], [0.3, 1.35]]) {
        mid.add(box(0.1, 1.3, 0.1, 0x8b6b43, 0, x, z));
        for (let k = 0; k < 5; k++) {
          const leaf = shadowy(new T.Mesh(new T.BoxGeometry(0.6, 0.03, 0.16), mat(0x3f9a3a, 0.7)));
          leaf.position.set(x + Math.cos((k / 5) * Math.PI * 2) * 0.28, 1.3, z + Math.sin((k / 5) * Math.PI * 2) * 0.28);
          leaf.rotation.y = -(k / 5) * Math.PI * 2;
          leaf.rotation.z = -0.35;
          mid.add(leaf);
        }
      }
    }
  }
  // ---------- 島面小擺設 (Sky, option A): paving, lamps, trees, planters and people walking, so the
  // island reads as a lived-in plaza rather than an empty plate. Picture pages only.
  const walkers: { g: any; a: number; speed: number; r: number; phase: number }[] = [];
  if (theme.art) {
    const id = theme.id;
    const style = {
      tree: id === "hawaii" || id === "dubai" ? "palm" : id === "jiangnan" ? "willow" : "cypress",
      planter: ({ greece: 0xf4f1ea, venice: 0xc0643a, hawaii: 0x8a5a33, jiangnan: 0x9aa0a6, dubai: 0xd9b98a } as Record<string, number>)[id] ?? 0xf4f1ea,
      flower: ({ greece: 0xe84a9a, venice: 0xd8342c, hawaii: 0xff5a5f, jiangnan: 0xf2a1c0, dubai: 0xf2c14e } as Record<string, number>)[id] ?? 0xe84a9a,
      post: ({ greece: 0x2f6fd0, venice: 0x2a2a2a, hawaii: 0x7a4a24, jiangnan: 0x6b3a22, dubai: 0xb8872e } as Record<string, number>)[id] ?? 0x2a2a2a,
      light: id === "jiangnan" ? 0xe53935 : id === "hawaii" ? 0xff8a1a : 0xffe08a,
    };
    // Paving stones over the island top.
    {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const x = c.getContext("2d")!;
      const base = new T.Color(theme.ground);
      x.fillStyle = `#${base.clone().multiplyScalar(0.78).getHexString()}`;
      x.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 5; col++) {
          const tone = base.clone().multiplyScalar(0.93 + ((row * 7 + col * 13) % 9) * 0.012);
          x.fillStyle = `#${tone.getHexString()}`;
          const off = row % 2 ? 26 : 0;
          x.fillRect(col * 52 + off - 26 + 2, row * 32 + 2, 48, 28);
          x.fillRect(col * 52 + off + 234, row * 32 + 2, 48, 28);
        }
      }
      const tex = new T.CanvasTexture(c);
      tex.encoding = T.sRGBEncoding;
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.repeat.set(5, 5);
      const pave = new T.Mesh(new T.CircleGeometry(4.05, 40), new T.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
      pave.rotation.x = -Math.PI / 2;
      pave.position.y = TOP + 0.02;
      pave.receiveShadow = true;
      island.add(pave);
    }
    const at = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
    const tree = (x: number, z: number, k = 1) => {
      const g = new T.Group();
      g.position.set(x, TOP, z);
      g.scale.setScalar(k);
      if (style.tree === "palm") {
        const trunk = shadowy(new T.Mesh(new T.CylinderGeometry(0.035, 0.06, 0.9, 6), flat(0x8b6b43)));
        trunk.position.y = 0.45;
        trunk.rotation.z = 0.12;
        g.add(trunk);
        for (let k2 = 0; k2 < 6; k2++) {
          const leaf = shadowy(new T.Mesh(new T.BoxGeometry(0.5, 0.02, 0.12), mat(0x3f9a3a, 0.7)));
          const a = (k2 / 6) * Math.PI * 2;
          leaf.position.set(0.05 + Math.cos(a) * 0.22, 0.9, Math.sin(a) * 0.22);
          leaf.rotation.y = -a;
          leaf.rotation.z = -0.4;
          g.add(leaf);
        }
      } else if (style.tree === "willow") {
        const trunk = shadowy(new T.Mesh(new T.CylinderGeometry(0.04, 0.06, 0.45, 6), flat(0x6b4a2b)));
        trunk.position.y = 0.22;
        g.add(trunk);
        for (const [dx, dy, dz, r] of [[0, 0.62, 0, 0.3], [0.16, 0.5, 0.08, 0.2], [-0.15, 0.5, -0.05, 0.22], [0.02, 0.45, -0.17, 0.18]]) {
          const blob = shadowy(new T.Mesh(new T.SphereGeometry(r, 10, 8), mat(0x8cc63f, 0.8)));
          blob.scale.y = 1.25;
          blob.position.set(dx, dy, dz);
          g.add(blob);
        }
      } else {
        const trunk = shadowy(new T.Mesh(new T.CylinderGeometry(0.03, 0.04, 0.15, 6), flat(0x6b4a2b)));
        trunk.position.y = 0.07;
        g.add(trunk);
        const cone = shadowy(new T.Mesh(new T.ConeGeometry(0.16, 0.8, 8), mat(0x2f6b35, 0.8)));
        cone.position.y = 0.52;
        g.add(cone);
      }
      island.add(g);
    };
    const lamp = (x: number, z: number) => {
      const g = new T.Group();
      g.position.set(x, TOP, z);
      const post = shadowy(new T.Mesh(new T.CylinderGeometry(0.025, 0.035, 0.7, 6), mat(style.post, 0.5)));
      post.position.y = 0.35;
      g.add(post);
      const bulb = new T.Mesh(
        id === "jiangnan" ? new T.SphereGeometry(0.08, 10, 8) : new T.BoxGeometry(0.1, 0.12, 0.1),
        mat(style.light, 0.4, { emissive: style.light, emissiveIntensity: 0.9 }),
      );
      bulb.position.y = 0.76;
      if (id === "jiangnan") bulb.scale.y = 1.3;
      g.add(bulb);
      island.add(g);
    };
    const planter = (x: number, z: number) => {
      const g = new T.Group();
      g.position.set(x, TOP, z);
      g.add(box(0.34, 0.16, 0.34, style.planter));
      for (let k2 = 0; k2 < 4; k2++) {
        const bush = shadowy(new T.Mesh(new T.SphereGeometry(0.09, 8, 6), mat(0x4f9a3f, 0.8)));
        bush.position.set(((k2 % 2) - 0.5) * 0.14, 0.2, (Math.floor(k2 / 2) - 0.5) * 0.14);
        g.add(bush);
        const bloom = new T.Mesh(new T.SphereGeometry(0.035, 6, 5), mat(style.flower, 0.6));
        bloom.position.set(bush.position.x + 0.04, 0.27, bush.position.z + 0.03);
        g.add(bloom);
      }
      island.add(g);
    };
    PLOT_AT.forEach((_, i) => {
      const a = Math.PI / 2 + (i / PLOTS) * Math.PI * 2 + Math.PI / 4 + Math.PI / PLOTS;
      const [lx, lz] = at(a - 0.14, 3.55);
      lamp(lx, lz);
      const [tx, tz] = at(a + 0.14, 3.55);
      tree(tx, tz, 0.9);
      const [px, pz] = at(a, 1.85);
      planter(px, pz);
    });
    // A few people strolling round the edge of the plaza.
    const shirts = [0xe53935, 0x1e88e5, 0xfbc02d, 0x43a047, 0x8e24aa];
    for (let k2 = 0; k2 < 5; k2++) {
      const g = new T.Group();
      const body = shadowy(new T.Mesh(new T.CylinderGeometry(0.055, 0.07, 0.22, 8), mat(shirts[k2], 0.7)));
      body.position.y = 0.17;
      g.add(body);
      const legs = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.08, 8), mat(0x37474f, 0.8));
      legs.position.y = 0.04;
      g.add(legs);
      const head = shadowy(new T.Mesh(new T.SphereGeometry(0.06, 10, 8), mat(0xf1c7a0, 0.7)));
      head.position.y = 0.34;
      g.add(head);
      island.add(g);
      walkers.push({ g, a: (k2 / 5) * Math.PI * 2 + 0.3, speed: (k2 % 2 ? 1 : -1) * (0.07 + k2 * 0.012), r: 3.85 + (k2 % 2) * 0.12, phase: k2 * 1.7 });
    }
  }
  // The town's monster, on a round stone in the middle.
  const monsters: Monster[] = [];
  if (who.resident) {
    const m = buildMonster(T, who.resident.element, who.resident.stage, who.resident.legend);
    const stand = shadowy(new T.Mesh(new T.CylinderGeometry(0.75, 0.85, 0.16, 20), mat(0xcfc6b5, 0.8)));
    stand.position.set(Math.sin(HOME_YAW) * 0.35, TOP + 0.08, Math.cos(HOME_YAW) * 0.35);
    island.add(stand);
    m.group.position.set(stand.position.x, TOP + 0.16, stand.position.z);
    m.group.rotation.y = HOME_YAW;
    m.group.scale.setScalar(m.model ? 2 : 1.25);
    island.add(m.group);
    monsters.push(m);
  }
  // Your monster when attacking: it hovers in front of the island.
  let attacker: Monster | null = null;
  const attackerHome = new T.Vector3(Math.sin(HOME_YAW) * 5.2, TOP + 1.4, Math.cos(HOME_YAW) * 5.2);
  const lungeState = { at: -1e9, to: new T.Vector3() };
  if (who.attacker) {
    attacker = buildMonster(T, who.attacker.element, who.attacker.stage, who.attacker.legend);
    attacker.group.scale.setScalar(attacker.model ? 2.1 : 1.3);
    attacker.group.position.copy(attackerHome);
    attacker.group.rotation.y = ATTACK_YAW;
    scene.add(attacker.group);
    monsters.push(attacker);
  }
  const floorShadow = new T.Mesh(new T.PlaneGeometry(14, 14), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.position.y = -7;
  // The busy world far below (the old dark floor's shadow and glow are hidden).
  floorShadow.visible = false;
  const backdrop = theme.art
    ? createSea(T, scene, camera, {
        url: `${theme.art.dir}/sea.webp`,
        w: 941,
        h: 1672,
        reduceMotion,
        boat: { url: `${theme.art.dir}/boat.webp`, aspect: theme.art.boatAspect, size: theme.art.boatSize },
        gull: { url: `${theme.art.dir}/gull.webp`, aspect: theme.art.gullAspect },
        boatV: theme.art.boatV,
      })
    : createBackdrop(T, scene, camera, { groundY: -80, size: 520, fogNear: 45, fogFar: 230, scale: 0.8, reduceMotion });
  // A few far rocks, turning at half the camera's speed for depth.
  const far = new T.Group();
  scene.add(far);
  far.visible = !theme.art;
  {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, d = 20 + Math.random() * 10;
      const r = shadowy(new T.Mesh(new T.CylinderGeometry(0.9, 0.5, 1.2, 7), flat(theme.rock)));
      r.position.set(Math.cos(a) * d, -4 + Math.random() * 7, Math.sin(a) * d);
      const t = new T.Mesh(new T.CylinderGeometry(0.95, 0.9, 0.2, 7), mat(theme.ground));
      t.position.y = 0.7;
      r.add(t);
      far.add(r);
    }
  }

  // ---------- Plots ----------
  const levelTex = (level: number) => {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 40;
    const x = c.getContext("2d")!;
    for (let k = 0; k < 5; k++) {
      x.beginPath();
      x.arc(16 + k * 32, 20, 11, 0, Math.PI * 2);
      x.fillStyle = k < level ? "#FBD000" : "rgba(255,255,255,0.55)";
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = "#1E3A8A";
      x.stroke();
    }
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    return tex;
  };
  const plusTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "rgba(255,255,255,0.9)";
    x.beginPath();
    x.arc(32, 32, 28, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#16A34A";
    x.fillRect(27, 14, 10, 36);
    x.fillRect(14, 27, 36, 10);
    return new T.CanvasTexture(c);
  })();
  const ringTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    x.strokeStyle = "#ff3b30";
    x.lineWidth = 10;
    x.beginPath();
    x.arc(64, 64, 50, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 6;
    for (const [a, b, c2, d] of [[64, 4, 64, 30], [64, 98, 64, 124], [4, 64, 30, 64], [98, 64, 124, 64]]) {
      x.beginPath();
      x.moveTo(a, b);
      x.lineTo(c2, d);
      x.stroke();
    }
    return new T.CanvasTexture(c);
  })();
  type Plot = { holder: any; body: any; pips: any; plus: any; ring: any; hit: any; level: number; popAt: number; shakeAt: number; cloudAt: number; pending: number | null; puffs: any[] };
  const plots: Plot[] = PLOT_AT.map(([x, z], i) => {
    const holder = new T.Group();
    holder.position.set(x, TOP, z);
    // Face out from the centre, toward the path.
    holder.rotation.y = Math.atan2(x, z);
    holder.scale.setScalar(1.35);
    island.add(holder);
    const hit = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 2.6, 10), new T.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.2;
    hit.userData.plot = i;
    holder.add(hit);
    const pips = new T.Sprite(new T.SpriteMaterial({ map: levelTex(0), transparent: true, depthTest: false }));
    pips.scale.set(1.0, 0.25, 1);
    pips.renderOrder = 5;
    holder.add(pips);
    const plus = new T.Sprite(new T.SpriteMaterial({ map: plusTex, transparent: true }));
    plus.scale.set(0.5, 0.5, 1);
    plus.position.y = 0.5;
    holder.add(plus);
    const ring = new T.Sprite(new T.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false, opacity: 0 }));
    ring.scale.set(1.1, 1.1, 1);
    ring.renderOrder = 6;
    holder.add(ring);
    return { holder, body: null, pips, plus, ring, hit, level: -1, popAt: -1e9, shakeAt: -1e9, cloudAt: -1e9, pending: null, puffs: [] };
  });
  const heightOf = (level: number, i = 0) =>
    level <= 0 ? 0.3 : theme.art ? theme.art.sizes[theme.art.names[i]][level - 1][1] * ART_UNIT * ART_GROW[level - 1] * 0.96 : ({ site: [0, 1.0, 0.95, 1.3, 1.9, 2.6], oriental: [0, 0.9, 1.25, 1.6, 1.9, 2.2], desert: [0, 0.8, 0.8, 1.0, 1.6, 1.7] } as Record<string, number[]>)[theme.style][level];
  function draw(i: number, level: number) {
    const p = plots[i];
    if (p.level === level) return;
    if (p.body) {
      p.holder.remove(p.body);
      p.body.traverse((o: any) => {
        o.geometry?.dispose();
        if (o.userData.lamp) lamps.splice(lamps.indexOf(o), 1);
        if (o.userData.spin) spinners.splice(spinners.indexOf(o), 1);
      });
    }
    p.body = building(level, i);
    p.holder.add(p.body);
    p.level = level;
    p.pips.material.map.dispose();
    p.pips.material.map = levelTex(level);
    p.pips.material.needsUpdate = true;
    p.pips.position.y = heightOf(level, i) + 0.35;
    p.pips.visible = false;
    p.plus.visible = level <= 0;
    p.ring.position.y = heightOf(level, i) * 0.5;
  }
  levels.forEach((level, i) => draw(i, level));
  let targets = false;

  // ---------- Sparkles, rubble and fireworks ----------
  type Bit = { mesh: any; v: any; born: number; life: number; spin: number };
  const bits: Bit[] = [];
  function burst(at: any, count: number, colours: number[], speed: number, life: number, size = 0.08, gravity = true) {
    for (let k = 0; k < count; k++) {
      const m = new T.Mesh(new T.BoxGeometry(size, size, size), new T.MeshBasicMaterial({ color: colours[k % colours.length], transparent: true }));
      m.position.copy(at);
      const dir = new T.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5).normalize();
      scene.add(m);
      bits.push({ mesh: m, v: dir.multiplyScalar(speed * (0.6 + Math.random() * 0.6)), born: performance.now(), life, spin: gravity ? 1 : 0 });
    }
  }
  const worldOf = (i: number, y: number) => plots[i].holder.localToWorld(new T.Vector3(0, y, 0));

  // ---------- Camera: orbit, pinch zoom, tap ----------
  const view = { yaw: HOME_YAW, elev: 0.72, goalYaw: HOME_YAW, goalElev: 0.72, dist: 16, goalDist: 16, idle: 0 };
  let fitDist = 16;
  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const half = Math.atan(Math.tan((38 * Math.PI) / 360) * Math.min(1, camera.aspect));
    fitDist = Math.max(9, 5.2 / Math.tan(half));
    view.goalDist = view.dist = fitDist;
  }
  const watch = new ResizeObserver(resize);
  watch.observe(container);
  resize();

  const pointers = new Map<number, { x: number; y: number }>();
  let tap: { x: number; y: number; at: number } | null = null;
  const ray = new T.Raycaster();
  const onDown = (e: PointerEvent) => {
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
      // Sky: the island only turns left and right; the tilt and the distance stay fixed.
      view.goalYaw -= (e.clientX - before.x) * 0.006;
    }
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    const t0 = tap;
    tap = null;
    if (e.type !== "pointerup" || !t0 || Math.hypot(e.clientX - t0.x, e.clientY - t0.y) > 10 || performance.now() - t0.at > 600) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(plots.map((p) => p.hit), false)[0];
    if (hit) onPick(hit.object.userData.plot);
  };
  const onWheel = (e: WheelEvent) => {
    // No zooming: the view is fixed apart from turning.
    e.preventDefault();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("lostpointercapture", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  let frameId = 0;
  // ---------- 雲遮換樓: a cloud covers a building, and when it clears the new level stands there ----------
  const puffTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(56, 52, 8, 64, 64, 62);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(246,250,255,0.98)");
    g.addColorStop(0.8, "rgba(222,234,250,0.75)");
    g.addColorStop(1, "rgba(210,226,248,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    return tex;
  })();
  const CLOUD_SWAP = 420, CLOUD_END = 1400;
  function cloudOver(i: number, next: number) {
    const p = plots[i];
    for (const puff of p.puffs) p.holder.remove(puff.s);
    const h = Math.max(heightOf(Math.max(p.level, 0), i), heightOf(next, i), 0.9);
    p.puffs = Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
      const s = new T.Sprite(new T.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      s.renderOrder = 8;
      p.holder.add(s);
      return { s, x: Math.cos(a) * 0.45, y: h * (0.2 + (k % 3) * 0.3), z: Math.sin(a) * 0.3, size: 0.9 + Math.random() * 0.5, dir: a };
    });
    p.pending = next;
    p.cloudAt = performance.now();
  }
  function cloudStep(i: number, now: number) {
    const p = plots[i];
    const age = now - p.cloudAt;
    if (p.pending !== null && age >= CLOUD_SWAP) {
      draw(i, p.pending);
      p.pending = null;
      p.popAt = now;
      burst(worldOf(i, heightOf(p.level, i) * 0.6), 26, [0xffd34d, 0xffffff, 0x7dd3fc], 3.2, 0.9, 0.07, false);
    }
    if (!p.puffs.length) return;
    if (age > CLOUD_END) {
      for (const puff of p.puffs) {
        p.holder.remove(puff.s);
        puff.s.material.dispose();
      }
      p.puffs = [];
      return;
    }
    const f = age / CLOUD_END;
    const cover = age < CLOUD_SWAP ? age / CLOUD_SWAP : 1;
    const open = age < CLOUD_SWAP + 120 ? 0 : (age - CLOUD_SWAP - 120) / (CLOUD_END - CLOUD_SWAP - 120);
    for (const puff of p.puffs) {
      const out = 1 + open * 1.6;
      puff.s.position.set(puff.x * out, puff.y + open * 0.4, puff.z * out);
      puff.s.scale.setScalar(puff.size * (0.4 + cover * 0.6) * (1 + open * 0.3));
      puff.s.material.opacity = Math.min(cover * 1.2, 1) * (1 - open);
      puff.s.material.rotation = f * (puff.dir > Math.PI ? 1 : -1) * 0.6;
    }
  }

  // ---------- Fireball, explosion and shield (攻擊, Sky 2026-09-30) ----------
  type Fx = { start: number; ms: number; step: (k: number, now: number) => void; end: () => void };
  const fxs: Fx[] = [];
  const addFx = (delay: number, ms: number, step: Fx["step"], end: Fx["end"] = () => undefined) =>
    fxs.push({ start: performance.now() + delay, ms, step, end });
  const fireTex = soft("rgba(255,244,200,1)", "rgba(255,90,0,0)");
  // A solid-looking ball of flame (normal blending, so it still reads on the white island).
  const flameTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(64, 60, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(255,250,210,1)");
    g.addColorStop(0.28, "rgba(255,206,60,1)");
    g.addColorStop(0.55, "rgba(255,110,20,0.95)");
    g.addColorStop(0.8, "rgba(210,40,10,0.55)");
    g.addColorStop(1, "rgba(160,20,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  })();
  const smokeTex = puffTex;
  // Sky's pictures (2026-09-30): a comet-like fireball and a cartoon explosion.
  const picTex = (url: string) => {
    const t = new T.TextureLoader().load(url);
    t.encoding = T.sRGBEncoding;
    return t;
  };
  const fireballPic = picTex("/art/fx/fireball.webp");
  const boomPic = picTex("/art/fx/boom.webp");
  const glowSprite = (tex: any, colour: number, additive = true) => {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, color: colour, transparent: true, depthWrite: false, depthTest: false, ...(additive ? { blending: T.AdditiveBlending } : {}) }));
    sp.renderOrder = 9;
    scene.add(sp);
    return sp;
  };
  const drop = (o: any) => {
    scene.remove(o);
    o.material?.dispose?.();
    o.geometry?.dispose?.();
  };
  const impactLight = new T.PointLight(0xff8a2a, 0, 9, 2);
  scene.add(impactLight);
  function explode(at: any, big: boolean, splash = false) {
    // A white-hot flash, a ball of fire, sparks and a rising smoke cloud.
    const flash = glowSprite(fireTex, 0xffffff);
    flash.position.copy(at);
    addFx(0, 380, (k) => {
      flash.scale.setScalar((big ? 4.2 : 2.6) * (0.3 + k));
      flash.material.opacity = 1 - k;
    }, () => drop(flash));
    const boom = glowSprite(boomPic, 0xffffff, false);
    boom.position.copy(at).y += big ? 0.35 : 0.15;
    const spin = (Math.random() - 0.5) * 0.6;
    addFx(0, big ? 1000 : 700, (k) => {
      const grow = k < 0.22 ? k / 0.22 : 1 + (k - 0.22) * 0.25;
      boom.scale.setScalar((big ? 3.4 : 2) * (0.25 + 0.75 * (1 - Math.pow(1 - Math.min(grow, 1), 3))) * (grow > 1 ? grow : 1));
      boom.material.opacity = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      boom.material.rotation = spin * k;
    }, () => drop(boom));
    impactLight.position.copy(at).y += 0.6;
    addFx(0, 700, (k) => (impactLight.intensity = (big ? 6 : 3) * (1 - k)), () => (impactLight.intensity = 0));
    for (let n = 0; n < (big ? 8 : 5); n++) {
      const f = glowSprite(flameTex, 0xffffff, false);
      // Hidden until its turn comes (it starts a few ms late), or it would flash in the middle of the island.
      f.position.copy(at);
      f.material.opacity = 0;
      const dir = new T.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.25, Math.random() - 0.5).normalize();
      const reach = (big ? 1.5 : 0.9) * (0.4 + Math.random() * 0.7);
      const size = (big ? 1.5 : 0.9) * (0.7 + Math.random() * 0.6);
      addFx(n * 10, 600 + Math.random() * 300, (k) => {
        f.position.copy(at).addScaledVector(dir, reach * (1 - (1 - k) * (1 - k)));
        f.position.y += k * 0.5;
        f.scale.setScalar(size * (0.45 + k * 0.9));
        f.material.opacity = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
        f.material.color.setRGB(1, 1 - k * 0.55, 1 - k * 0.8);
      }, () => drop(f));
    }
    // A ring of dust racing out along the ground.
    const ring = new T.Mesh(new T.RingGeometry(0.7, 1, 40), new T.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, depthWrite: false, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, TOP + 0.05, at.z);
    ring.visible = !splash;
    scene.add(ring);
    addFx(0, 500, (k) => {
      ring.scale.setScalar((big ? 2.4 : 1.4) * (0.3 + k));
      ring.material.opacity = 0.8 * (1 - k);
    }, () => drop(ring));
    for (let n = 0; n < (splash ? 0 : big ? 9 : 4); n++) {
      const sm = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, color: 0x4a4440, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      sm.renderOrder = 8;
      scene.add(sm);
      const dx = (Math.random() - 0.5) * 1.2, dz = (Math.random() - 0.5) * 1.2;
      addFx(120 + n * 40, 1400 + Math.random() * 500, (k) => {
        sm.position.set(at.x + dx * (0.4 + k), at.y + 0.2 + k * 1.8, at.z + dz * (0.4 + k));
        sm.scale.setScalar((big ? 1.2 : 0.8) * (0.5 + k * 1.4));
        sm.material.opacity = 0.85 * Math.min(1, k * 4) * (1 - k);
        sm.material.rotation = k * 0.8;
      }, () => drop(sm));
    }
    burst(at, big ? 30 : 16, [0xffd34d, 0xff7a1a, 0xffffff], big ? 5 : 3.5, 0.9, 0.07, true);
    if (!splash) shakeAll = performance.now();
  }
  const shieldGeo = new T.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const shieldPic = picTex("/art/fx/shield.webp");
  function shieldAt(at: any, radius: number, broken: boolean, from: any = null) {
    // Sky's shield picture (2026-09-30) stands in front of the building, facing the fireball: it springs up
    // just before the hit, jolts and flashes when struck, then fades — or flies apart if it breaks.
    const badge = glowSprite(shieldPic, 0xffffff, false);
    badge.renderOrder = 8;
    const face = from ? from.clone().sub(at).setY(0).normalize() : new T.Vector3(0, 0, 1);
    const spot = new T.Vector3(at.x, TOP + 0.95, at.z).addScaledVector(face, radius * 0.95);
    badge.position.copy(spot);
    badge.material.opacity = 0;
    const bPop = FIRE_MS - 320, bHit = FIRE_MS, bEnd = broken ? FIRE_MS + 380 : FIRE_MS + 1000;
    addFx(bPop, bEnd - bPop, (k) => {
      const t = bPop + k * (bEnd - bPop);
      const grow = Math.min(1, (t - bPop) / 200);
      const pop = grow < 1 ? grow * (1 + Math.sin(grow * Math.PI) * 0.35) : 1;
      const struck = Math.max(0, 1 - Math.abs(t - bHit) / 180);
      const after = t > bHit ? (t - bHit) / (bEnd - bHit) : 0;
      badge.scale.setScalar(1.7 * pop * (1 + 0.15 * struck) * (broken ? 1 + after * 1.2 : 1));
      badge.position.copy(spot).addScaledVector(face, struck * 0.12 * Math.sin(t / 22));
      badge.material.color.setRGB(1 + struck, 1 + struck, 1 + struck);
      badge.material.rotation = broken && t > bHit ? after * 0.9 : Math.sin(t / 30) * 0.08 * struck;
      badge.material.opacity = Math.min(1, grow * 2) * (after > 0 ? (broken ? 1 - after : after > 0.6 ? 1 - (after - 0.6) / 0.4 : 1) : 1);
    }, () => drop(badge));
    // A glassy blue dome over the building: it pops up just before the fireball lands, ripples when struck,
    // then fades (or bursts into shards if it breaks).
    const dome = new T.Mesh(shieldGeo, new T.MeshBasicMaterial({ color: 0x2f9dff, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide }));
    const rim = new T.Mesh(shieldGeo, new T.MeshBasicMaterial({ color: 0x1e6fe0, wireframe: true, transparent: true, opacity: 0, depthWrite: false }));
    const g = new T.Group();
    g.add(dome, rim);
    g.position.set(at.x, TOP, at.z);
    scene.add(g);
    const pop = FIRE_MS - 260, hit = FIRE_MS;
    const life = broken ? hit + 160 : hit + 900;
    addFx(pop, life - pop, (k) => {
      const t = pop + k * (life - pop);
      const grow = Math.min(1, (t - pop) / 180);
      const struck = Math.max(0, 1 - Math.abs(t - hit) / 220);
      g.scale.set(radius * (grow * (1 + 0.12 * struck)), radius * 1.15 * grow * (1 - 0.08 * struck), radius * (grow * (1 + 0.12 * struck)));
      const fade = t > hit ? 1 - (t - hit) / (life - hit) : 1;
      dome.material.opacity = (0.22 + 0.3 * struck) * fade;
      rim.material.opacity = (0.3 + 0.4 * struck) * fade;
      dome.material.color.setHex(struck > 0.3 ? 0x8fd4ff : 0x2f9dff);
      g.rotation.y += 0.02;
    }, () => {
      scene.remove(g);
      dome.material.dispose();
      rim.material.dispose();
    });
    addFx(hit, 10, () => undefined, () => {
      const top = new T.Vector3(at.x, TOP + radius * 0.8, at.z);
      if (broken) burst(top, 40, [0x7fd8ff, 0xffffff, 0x2f9dff], 5, 1.0, 0.1, true);
      else burst(top, 26, [0xffffff, 0x7fd8ff, 0x2f9dff], 4, 0.7, 0.08, false);
    });
  }
  function fireball(from: any, to: any) {
    const halo = glowSprite(fireTex, 0xff7a1a);
    const core = glowSprite(fireballPic, 0xffffff, false);
    // The ball sits low-left in the picture with its tail up-right; pin the ball and turn the tail behind it.
    core.center.set(0.33, 0.37);
    const prev = new T.Vector3().copy(from).project(camera);
    const trail: any[] = [];
    let lastPuff = 0;
    addFx(0, FIRE_MS, (k, now) => {
      const p = new T.Vector3().lerpVectors(from, to, k);
      p.y += Math.sin(k * Math.PI) * 1.4;
      core.position.copy(p);
      halo.position.copy(p);
      core.scale.setScalar(1.5 + Math.sin(now / 40) * 0.08);
      halo.scale.setScalar(1.7 + Math.sin(now / 55) * 0.15);
      const onScreen = p.clone().project(camera);
      const dx = onScreen.x - prev.x, dy = (onScreen.y - prev.y) / camera.aspect;
      if (Math.hypot(dx, dy) > 1e-4) core.material.rotation = Math.atan2(dy, dx) + (3 * Math.PI) / 4;
      prev.copy(onScreen);
      if (now - lastPuff > 30) {
        lastPuff = now;
        const t = glowSprite(flameTex, 0xffffff, false);
        t.position.copy(p);
        trail.push(t);
        addFx(0, 380, (q) => {
          t.scale.setScalar(0.6 * (1 - q * 0.7));
          t.material.opacity = 0.9 * (1 - q);
          t.material.color.setRGB(1, 1 - q * 0.6, 1 - q * 0.9);
          t.position.y += 0.004;
        }, () => drop(t));
      }
    }, () => {
      drop(core);
      drop(halo);
    });
  }

  let last = performance.now();
  let shakeAll = -1e9;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    backdrop.update(now, dt);
    for (const l of lamps) l.scale.setScalar(0.55 + Math.sin(now / 350) * 0.12);
    if (!reduceMotion) for (const sp of spinners) sp.material.rotation -= dt * 1.1;
    last = now;
    const bob = reduceMotion ? 0 : Math.sin(now / 1400) * 0.12;
    island.position.y = bob;
    const quake = Math.max(0, 1 - (now - shakeAll) / 500);
    island.position.x = quake ? Math.sin(now / 18) * 0.08 * quake : 0;
    plots.forEach((_, i) => cloudStep(i, now));
    for (const p of plots) {
      const k = Math.min(1, (now - p.popAt) / 450);
      const s = k < 1 ? 0.5 + 0.5 * k + Math.sin(k * Math.PI) * 0.25 : 1;
      if (p.body) p.body.scale.setScalar(s);
      const shake = Math.max(0, 1 - (now - p.shakeAt) / 400);
      if (p.body) p.body.rotation.z = shake ? Math.sin(now / 25) * 0.12 * shake : 0;
      const on = targets && p.level > 0;
      p.ring.material.opacity = on ? 0.6 + 0.4 * Math.sin(now / 200) : 0;
      p.plus.scale.setScalar(0.5 + Math.sin(now / 400 + p.holder.position.x) * 0.04);
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i], age = (now - b.born) / 1000;
      if (age > b.life) {
        scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        bits.splice(i, 1);
        continue;
      }
      if (b.spin) b.v.y -= 9 * dt;
      else b.v.multiplyScalar(0.97);
      b.mesh.position.addScaledVector(b.v, dt);
      b.mesh.rotation.x += dt * 6;
      b.mesh.rotation.y += dt * 5;
      b.mesh.material.opacity = Math.max(0, 1 - age / b.life);
    }
    for (const w of walkers) {
      if (!reduceMotion) w.a += w.speed * dt;
      w.g.position.set(Math.cos(w.a) * w.r, TOP + Math.abs(Math.sin(now / 160 + w.phase)) * 0.03, Math.sin(w.a) * w.r);
      w.g.rotation.y = -w.a + (w.speed > 0 ? 0 : Math.PI);
    }
    for (let n = fxs.length - 1; n >= 0; n--) {
      const f = fxs[n];
      if (now < f.start) continue;
      const k = Math.min(1, (now - f.start) / f.ms);
      f.step(k, now);
      if (k >= 1) {
        fxs.splice(n, 1);
        f.end();
      }
    }
    for (const m of monsters) m.update(now);
    if (attacker) {
      // Swoop out to the target and back over ~0.9s; otherwise bob in the air.
      const k = (now - lungeState.at) / 900;
      if (k < 1) {
        const out = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
        const ease = out * out * (3 - 2 * out);
        attacker.group.position.lerpVectors(attackerHome, lungeState.to, ease);
        attacker.group.rotation.y = Math.atan2(lungeState.to.x - attackerHome.x, lungeState.to.z - attackerHome.z);
      } else {
        attacker.group.position.set(attackerHome.x, attackerHome.y + Math.sin(now / 600) * 0.15, attackerHome.z);
        attacker.group.rotation.y = ATTACK_YAW;
      }
    }
    view.idle += dt;
    view.yaw += (view.goalYaw - view.yaw) * Math.min(1, dt * 8);
    view.elev += (view.goalElev - view.elev) * Math.min(1, dt * 8);
    view.dist += (view.goalDist - view.dist) * Math.min(1, dt * 6);
    const sway = reduceMotion ? 0 : Math.sin(now / 7000) * 0.15 * Math.min(1, Math.max(0, view.idle - 2) / 3);
    const yaw = view.yaw + sway, flatD = Math.cos(view.elev) * view.dist;
    camera.position.set(Math.sin(yaw) * flatD, AIM_Y + Math.sin(view.elev) * view.dist, Math.cos(yaw) * flatD);
    camera.lookAt(0, AIM_Y, 0);
    far.rotation.y = yaw * 0.5;
    pinToPicture();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  return {
    setLevels(next, pop = null) {
      next.forEach((level, i) => {
        if (i === pop && plots[i]) cloudOver(i, level);
        else if (plots[i]?.pending === null) draw(i, level);
      });
    },
    setTargets(on) {
      targets = on;
    },
    smash(index) {
      if (!plots[index]) return;
      plots[index].shakeAt = performance.now();
      shakeAll = performance.now();
      burst(worldOf(index, heightOf(plots[index].level, index) * 0.5), 34, [theme.wall, theme.roof, 0x6b6f78, 0xff7a1a], 4.5, 1.1, 0.11);
    },
    lunge(index) {
      if (!plots[index]) return;
      lungeState.to.copy(worldOf(index, heightOf(plots[index].level, index) * 0.7));
      lungeState.at = performance.now();
    },
    fire(index, result) {
      const plot = index === null ? null : plots[index];
      const to = plot ? worldOf(index!, Math.max(0.5, heightOf(plot.level, index!) * (result === "block" ? 0.9 : 0.55))) : new T.Vector3(0, TOP + 0.3, 0);
      // The dragon rears back a little and breathes from its mouth, facing the target.
      const mouth = attacker ? attacker.group.position.clone().add(new T.Vector3(0, 0.7, 0)) : attackerHome.clone();
      lungeState.to.copy(attackerHome).lerp(to, 0.18);
      lungeState.at = performance.now() - 250;
      const aim = to.clone();
      if (result === "block") {
        // Stop at the dome's skin, in front of the building.
        const r = plot ? 1.25 : 1.65;
        const c = plot ? worldOf(index!, 0) : new T.Vector3(0, 0, 0);
        aim.copy(c).add(mouth.clone().sub(c).setY(0).normalize().multiplyScalar(r));
        aim.y = TOP + 0.9;
      }
      fireball(mouth, aim);
      if (result === "block" || result === "break") shieldAt(plot ? worldOf(index!, 0) : new T.Vector3(0, 0, 0), plot ? 1.3 : 1.7, result === "break", mouth);
      if (result === "block") {
        // The fireball splashes harmlessly against the shield.
        addFx(FIRE_MS, 10, () => undefined, () => explode(aim, false, true));
        return;
      }
      addFx(FIRE_MS + (result === "break" ? 120 : 0), 10, () => undefined, () => {
        explode(to, result !== "hit");
        if (plot && result !== "hit") {
          plot.shakeAt = performance.now();
          burst(to, 34, [theme.wall, theme.roof, 0x6b6f78, 0xff7a1a], 4.5, 1.1, 0.11);
        }
      });
    },
    celebrate() {
      const colours = [0xfbd000, 0xe52521, 0x22c55e, 0x3b82f6, 0xec4899, 0xf97316];
      for (let k = 0; k < 6; k++) {
        window.setTimeout(() => {
          const a = Math.random() * Math.PI * 2;
          burst(new T.Vector3(Math.cos(a) * 2.5, 4 + Math.random() * 2, Math.sin(a) * 2.5), 40, [colours[k % 6], 0xffffff], 4, 1.4, 0.09, false);
        }, k * 260);
      }
    },
    dispose() {
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
