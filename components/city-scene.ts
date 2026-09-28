/**
 * A town page in 3D: one big floating island for the theme, five building plots round a centre
 * piece, and each building drawn in the theme's own style at its level (1 small → 5 landmark).
 * Used for your own town (tap a plot to build) and a rival's town (tap a building to strike).
 * Drag to turn and tilt, pinch to zoom, like the boards.
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
  /** Fireworks over the whole island (a page finished). */
  celebrate(): void;
  dispose(): void;
};

const TOP = 0.3;
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
      glow.position.set((lu - 0.5) * w * ART_UNIT, (1 - lv - 0.04) * h * ART_UNIT, 0.05);
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
      sails.position.set((su - 0.5) * w * ART_UNIT, (1 - sv - 0.04) * h * ART_UNIT, 0.05);
      sails.scale.setScalar(sd * k * ART_UNIT);
      sails.userData.spin = true;
      g.add(sails);
      spinners.push(sails);
    }
    return g;
  }
  const spinners: any[] = [];
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
    path.position.y = TOP + 0.005;
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
      // Picture pages keep the middle clear: a white stone disc with a ring of blue.
      const disc = shadowy(new T.Mesh(new T.CylinderGeometry(1.1, 1.15, 0.08, 28), mat(0xf6f2ea, 0.8)));
      disc.position.y = 0.04;
      mid.add(disc);
      const rim = new T.Mesh(new T.RingGeometry(1.0, 1.1, 40), mat(theme.trim, 0.6));
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.085;
      mid.add(rim);
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
        boat: { url: `${theme.art.dir}/boat.webp`, aspect: 256 / 250 },
        gull: { url: `${theme.art.dir}/gull.webp`, aspect: 256 / 192 },
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
      view.goalYaw -= (e.clientX - before.x) * 0.006;
      view.goalElev = Math.max(0.3, Math.min(1.35, view.goalElev + (e.clientY - before.y) * 0.004));
    } else {
      const other = pts.find((p) => p !== before)!;
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (was > 1 && is > 1) view.goalDist = Math.max(6, Math.min(40, view.goalDist * (was / is)));
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
    e.preventDefault();
    view.goalDist = Math.max(6, Math.min(40, view.goalDist * Math.exp(e.deltaY * 0.0012)));
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
