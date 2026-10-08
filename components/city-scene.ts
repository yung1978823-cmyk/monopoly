/**
 * A town page in 3D: one big floating island for the theme, five building plots round a centre
 * piece, and each building drawn in the theme's own style at its level (1 small → 5 landmark).
 * Used for your own town (tap a plot to build) and a rival's town (tap a building to strike).
 * Drag left and right to turn the island; the tilt and distance stay fixed.
 */
import { createBackdrop, createSea, createSpace } from "@/components/backdrop";
import { ACTORS, loadGltfLoader } from "@/components/eight-scene";
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
  const showcase = !!theme.art?.showcase;
  /** How far the 展示台 island turns either way when dragged (about 15°). */
  const SHOW_TURN = 0.26;
  /** 展示台: every level a clear step bigger, level 5 towering over the rest. */
  const SHOW_GROW = [0.62, 0.74, 0.86, 0.98, 1.12];
  /** How tall the pedestal under each level is (0 = straight on the ground). */
  const PLINTH = [0, 0.05, 0.1, 0.16, 0.24];
  const growOf = (level: number) => (showcase ? SHOW_GROW : ART_GROW)[level - 1];
  const plinthOf = (level: number, i = -1) =>
    showcase && level > 0 && !(i >= 0 && theme.art?.based?.includes(theme.art.names[i])) ? PLINTH[level - 1] : 0;
  function artBuilding(i: number, level: number): any {
    const art = theme.art!, name = art.names[i], [pw, ph] = art.sizes[name][level - 1], k = growOf(level);
    const w = pw * k, h = ph * k;
    const url = `${art.dir}/${name}${level}.webp`;
    const flip = !!art.mirror?.includes(name);
    const key = flip ? `${url}#flip` : url;
    let tex = artTex.get(key);
    if (!tex) {
      tex = new T.TextureLoader().load(url);
      tex.encoding = T.sRGBEncoding;
      if (flip) {
        // A sprite ignores a negative scale, so the picture itself is mirrored.
        tex.wrapS = T.RepeatWrapping;
        tex.repeat.x = -1;
        tex.offset.x = 1;
      }
      artTex.set(key, tex);
    }
    const g = new T.Group();
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.2 }));
    s.center.set(0.5, 0.04);
    s.scale.set(w * ART_UNIT, h * ART_UNIT, 1);
    s.position.y = plinthOf(level, i);
    g.add(s);
    if (showcase) dressStage(g, level, w * ART_UNIT, h * ART_UNIT, plinthOf(level, i));
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
  // ---------- 展示台: what each level stands on and glows with (Sky 2026-10-08: every stage must look different) ----------
  // 1 — on the bare floor, just a shadow.
  // 2 — a low crystal plinth.
  // 3 — a taller plinth with a gold rim, and a soft light ring on the floor.
  // 4 — a two-step plinth, a turning ring of light, a glow behind and a few sparkles circling.
  // 5 — a grand three-step plinth, a bright gold ring, a halo, a pillar of light into the sky and many sparkles.
  const ringGlowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(128, 128, 60, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.55, "rgba(255,255,255,0.9)");
    g.addColorStop(0.7, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    // A few bright marks round the ring, so its turning shows.
    x.fillStyle = "rgba(255,255,255,1)";
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      x.beginPath();
      x.arc(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100, k % 3 ? 3 : 6, 0, Math.PI * 2);
      x.fill();
    }
    return new T.CanvasTexture(c);
  })();
  const haloTex = soft("rgba(255,255,255,0.9)", "rgba(255,255,255,0)");
  const beamTex = (() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const x = c.getContext("2d")!;
    const across = x.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, "rgba(255,255,255,0)");
    across.addColorStop(0.5, "rgba(255,255,255,1)");
    across.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = across;
    x.fillRect(0, 0, 64, 256);
    x.globalCompositeOperation = "destination-in";
    const up = x.createLinearGradient(0, 0, 0, 256);
    up.addColorStop(0, "rgba(0,0,0,0)");
    up.addColorStop(1, "rgba(0,0,0,1)");
    x.fillStyle = up;
    x.fillRect(0, 0, 64, 256);
    return new T.CanvasTexture(c);
  })();
  const STAGE_COLOUR = [0xffffff, 0xb9a8ff, 0x58c8ff, 0xa45cff, 0xffc21a];
  type Aura = { obj: any; kind: "ring" | "halo" | "beam" | "mote"; base: number; phase: number; r?: number; y?: number; speed?: number };
  const auras: Aura[] = [];
  function dressStage(g: any, level: number, w: number, h: number, lift: number) {
    const colour = STAGE_COLOUR[level - 1];
    const glow = (map: any, opacity: number) =>
      new T.MeshBasicMaterial({ map, color: colour, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity });
    const r = Math.max(0.26, w * 0.34);
    // The plinth: one more step per level from 2 up.
    // The plinth never hides the picture's feet (the picture stands upright on it): it writes no depth and draws first.
    const stone = mat(0x5b4f96, 0.5, { emissive: 0x1a1240, depthWrite: false, transparent: true });
    const gold = mat(0xe8b830, 0.3, { metalness: 0.5, emissive: 0x3a2600, depthWrite: false, transparent: true });
    const steps = lift <= 0 ? 0 : level >= 5 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0;
    let y = 0;
    for (let k = 0; k < steps; k++) {
      const sr = r * (1.15 - k * 0.16);
      const sh = lift / steps;
      const slab = shadowy(new T.Mesh(new T.CylinderGeometry(sr, sr * 1.04, sh, 28), stone));
      slab.position.y = y + sh / 2;
      slab.renderOrder = -10 + k;
      g.add(slab);
      if (level >= 3) {
        const rim = new T.Mesh(new T.TorusGeometry(sr * 1.01, 0.012 + level * 0.003, 6, 40), gold);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = y + sh;
        rim.renderOrder = -10 + k;
        g.add(rim);
      }
      y += sh;
    }
    // A ring of light on the floor (3 up), turning from 4.
    if (level >= 3) {
      const size = r * (level >= 5 ? 3.0 : level >= 4 ? 2.6 : 2.3);
      const ring = new T.Mesh(
        new T.PlaneGeometry(size, size),
        new T.MeshBasicMaterial({ map: ringGlowTex, color: colour, transparent: true, depthWrite: false, opacity: level >= 5 ? 0.75 : 0.5 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      g.add(ring);
      auras.push({ obj: ring, kind: "ring", base: ring.material.opacity, phase: Math.random() * 6, speed: level >= 4 ? (level >= 5 ? 0.5 : 0.3) : 0 });
    }
    // A glow behind the building (4 up).
    if (level >= 4) {
      const halo = new T.Sprite(new T.SpriteMaterial({ map: haloTex, color: colour, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: level >= 5 ? 0.3 : 0.22 }));
      halo.scale.set(w * 1.5, h * 1.05, 1);
      halo.position.y = lift + h * 0.5;
      halo.renderOrder = -1;
      g.add(halo);
      auras.push({ obj: halo, kind: "halo", base: halo.material.opacity, phase: Math.random() * 6 });
    }
    // A pillar of light into the sky (5) — taken away (Sky 2026-10-08: 唔要射下來的光).
    if (level >= 5 && false) {
      const beam = new T.Mesh(new T.CylinderGeometry(r * 0.55, r * 0.9, 7, 20, 1, true), glow(beamTex, 0.3));
      // Only the far half shows, so the pillar stands behind the picture instead of washing over it.
      beam.material.side = T.BackSide;
      beam.renderOrder = -1;
      beam.position.y = 3.5;
      g.add(beam);
      auras.push({ obj: beam, kind: "beam", base: 0.3, phase: Math.random() * 6 });
    }
    // Sparkles circling (4: a few, 5: many).
    const motes = level >= 5 ? 14 : level >= 4 ? 6 : level >= 3 ? 3 : 0;
    for (let k = 0; k < motes; k++) {
      const m = new T.Sprite(new T.SpriteMaterial({ map: haloTex, color: colour, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.9 }));
      m.scale.setScalar(0.07 + Math.random() * 0.06);
      g.add(m);
      auras.push({ obj: m, kind: "mote", base: 0.9, phase: (k / motes) * Math.PI * 2, r: r * (1.2 + Math.random() * 0.5), y: lift + h * (0.15 + Math.random() * 0.8), speed: 0.5 + Math.random() * 0.5 });
    }
  }
  function auraStep(now: number) {
    const t = now / 1000;
    for (let k = auras.length - 1; k >= 0; k--) {
      const a = auras[k];
      if (!a.obj.parent) {
        auras.splice(k, 1);
        continue;
      }
      if (reduceMotion) continue;
      if (a.kind === "ring") {
        a.obj.rotation.z = t * (a.speed ?? 0);
        a.obj.material.opacity = a.base * (0.8 + 0.2 * Math.sin(t * 2 + a.phase));
      } else if (a.kind === "halo") {
        a.obj.material.opacity = a.base * (0.75 + 0.25 * Math.sin(t * 1.6 + a.phase));
      } else if (a.kind === "beam") {
        a.obj.material.opacity = a.base * (0.7 + 0.3 * Math.sin(t * 2.4 + a.phase));
        a.obj.rotation.y = t * 0.4;
      } else {
        const ang = a.phase + t * (a.speed ?? 0.6);
        a.obj.position.set(Math.cos(ang) * a.r!, a.y! + Math.sin(t * 1.3 + a.phase) * 0.12, Math.sin(ang) * a.r! * 0.6);
        a.obj.material.opacity = a.base * (0.5 + 0.5 * Math.abs(Math.sin(t * 3 + a.phase)));
      }
    }
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
    const workers = [...crews.values()].flatMap((crew) => crew.men.map((w) => w.s));
    for (const o of [...spinners, ...lamps, ...workers]) {
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
    const painted = theme.art?.island ? theme.art.dir : null;
    if (painted) {
      // 島面 (Sky 2026-10-02): the painted round floor on top, the painted rock hanging underneath.
      const load = (url: string) => {
        const t = new T.TextureLoader().load(url);
        t.encoding = T.sRGBEncoding;
        t.anisotropy = 4;
        return t;
      };
      const floorTex = load(`${painted}/top.webp`);
      // The picture's circle almost fills the square; pull in a hair so no black shows at the rim.
      floorTex.repeat.set(0.96, 0.96);
      floorTex.offset.set(0.02, 0.025);
      const floor = new T.Mesh(new T.CircleGeometry(4.2, 72), new T.MeshStandardMaterial({ map: floorTex, roughness: 1, color: 0xc4c4c4 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = TOP;
      floor.receiveShadow = true;
      island.add(floor);
      // A thin lip so the floor has an edge.
      const lip = new T.Mesh(new T.CylinderGeometry(4.2, 4.15, 0.14, 72, 1, true), new T.MeshBasicMaterial({ color: theme.art!.islandTrim ?? 0xa99ad6 }));
      lip.position.y = TOP - 0.07;
      island.add(lip);
      // The rock: the strip wraps round a cone, mirrored at every join so the seams match.
      const sideTex = load(`${painted}/side.webp`);
      sideTex.wrapS = T.MirroredRepeatWrapping;
      sideTex.repeat.set(4, 1);
      const H = theme.art!.islandDepth ?? 3.8;
      const rockMat = new T.MeshBasicMaterial({ map: sideTex, transparent: true, alphaTest: 0.04, side: T.DoubleSide });
      const under = new T.Mesh(new T.CylinderGeometry(4.15, 3.3, H, 72, 1, true), rockMat);
      under.position.y = TOP - 0.14 - H / 2;
      island.add(under);
      // A solid core inside, so the gaps between the hanging crystals show rock, not the far side.
      const core = new T.Mesh(
        new T.CylinderGeometry(4.0, 2.2, Math.min(2.6, H * 0.75), 48, 1, true),
        new T.MeshBasicMaterial({ color: theme.art!.islandCore ?? 0x4a4266 }),
      );
      core.position.y = TOP - 0.14 - Math.min(2.6, H * 0.75) / 2;
      island.add(core);
    }
    const top = shadowy(new T.Mesh(rough(new T.CylinderGeometry(4.2, 4.35, 0.3, 12), 0.15), mat(theme.ground, 0.85)));
    top.position.y = TOP - 0.15;
    if (!painted) island.add(top);
    const soil = shadowy(new T.Mesh(rough(new T.CylinderGeometry(4.35, 3.7, 0.5, 12), 0.2), flat(0x7a5230)));
    soil.position.y = TOP - 0.55;
    if (!painted) island.add(soil);
    const rock = shadowy(new T.Mesh(rough(new T.CylinderGeometry(3.7, 2.8, 2.2, 11, 2), 0.3), flat(theme.rock)));
    rock.position.y = TOP - 1.9;
    if (!painted) island.add(rock);
    const cap = shadowy(new T.Mesh(rough(new T.SphereGeometry(2.8, 11, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0.25), flat(theme.rock)));
    cap.scale.y = 0.5;
    cap.position.y = TOP - 3;
    if (!painted) island.add(cap);
    // A path ring joining the plots.
    const path = new T.Mesh(new T.RingGeometry(2.45, 3.05, 40), mat(0xd9c9a3, 0.95));
    path.rotation.x = -Math.PI / 2;
    path.position.y = TOP + 0.03;
    path.receiveShadow = true;
    if (!painted) island.add(path);
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
  // ---------- 島面 (Sky 2026-10-02): paving and the characters walking round; no other decorations, so the
  // buildings stand out. Picture pages only.
  type Job = { plot: number; at: number; from: [number, number]; to: [number, number]; walk: number; work: number; struck: number };
  const walkers: { g: any; a: number; speed: number; r: number; phase: number; mixer?: any; model?: any; hammer?: any; job?: Job }[] = [];
  if (theme.art) {
    // Paving stones over the island top (not on a painted island).
    if (!theme.art.island) {
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
    // Sky (2026-10-02): no lamps, trees, crystals or planters on the island — just the buildings, the
    // characters walking round and the dragon.
    // A few people strolling round the edge of the plaza.
    const shirts = [0xe53935, 0x1e88e5, 0xfbc02d, 0x43a047, 0x8e24aa];
    for (let k2 = 0; k2 < 4; k2++) {
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
      const walker: (typeof walkers)[number] = { g, a: (k2 / 4) * Math.PI * 2 + 0.3, speed: (k2 % 2 ? 1 : -1) * (0.07 + k2 * 0.012), r: (showcase ? 1.45 : 3.85) + (k2 % 2) * 0.12, phase: k2 * 1.7 };
      walkers.push(walker);
      // Real little people walking (Sky 2026-10-01): the game's 3D characters with their own walk, in place of
      // the pegs. The peg stands in until the model has loaded.
      const actor = ACTORS[["vampire", "jiangshi", "mummy", "zombie"][k2]];
      if (actor && !reduceMotion) {
        loadGltfLoader(T)
          .then((Loader) => new Promise<any>((resolve, reject) => new Loader().load(actor.url, resolve, undefined, reject)))
          .then((gltf) => {
            const model = gltf.scene;
            model.traverse((o: any) => {
              if (!o.isMesh) return;
              o.castShadow = true;
              o.frustumCulled = false;
              o.material.metalness = 0;
              o.material.roughness = Math.max(0.6, o.material.roughness ?? 0.6);
            });
            // Twice the old size (Sky 2026-10-02): about 1.0 tall.
            model.scale.setScalar(1.0 / 1.2);
            g.children.forEach((c: any) => (c.visible = false));
            g.add(model);
            const mixer = new T.AnimationMixer(model);
            const clip = gltf.animations.find((a: any) => a.name === "walk") ?? gltf.animations[0];
            if (clip) {
              const walk = mixer.clipAction(clip);
              walk.timeScale = actor.walkPace * 0.6;
              walk.play();
            }
            walker.mixer = mixer;
            walker.model = model;
            // A little hammer in hand, shown only while building (Sky 2026-10-02: the walkers do the building).
            const hammer = new T.Group();
            const handle = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.17, 6), mat(0x8b5a2b, 0.7));
            handle.position.y = 0.085;
            const head = new T.Mesh(new T.BoxGeometry(0.09, 0.05, 0.05), mat(0xd4a72c, 0.3, { metalness: 0.5 }));
            head.position.y = 0.17;
            hammer.add(handle, head);
            hammer.position.set(0.14, 0.3, 0.08);
            hammer.scale.setScalar(1.5);
            hammer.visible = false;
            g.add(hammer);
            walker.hammer = hammer;
          })
          .catch(() => {
            // Keep the peg.
          });
      }
    }
  }
  // 冰牙守護獸 (Sky 2026-10-02, Meshy "Frostfang Guardian"): an ice wolf trotting round every page on four legs,
  // about as big as the characters. The model ships without a skeleton, so four leg bones are added here
  // (hips found from the mesh: legs hang below y -0.1, front legs ahead of z 0.1) and swung in a trot.
  // 展示台 (Sky 2026-10-08): everyone walks the ring inside the statues and never through them.
  const wolf = { g: new T.Group(), a: 1.9, speed: -0.11, r: showcase ? 1.75 : 3.35, model: null as any, legs: [] as any[] };
  if (theme.art) {
    island.add(wolf.g);
    loadGltfLoader(T)
      .then((Loader) => new Promise<any>((resolve, reject) => new Loader().load("/models/frostfang.glb", resolve, undefined, reject)))
      .then((gltf) => {
        const model = gltf.scene;
        const meshes: any[] = [];
        model.traverse((o: any) => {
          if (o.isMesh && !o.isSkinnedMesh) meshes.push(o);
        });
        for (const mesh of meshes) {
          const geo = mesh.geometry;
          const pos = geo.attributes.position;
          const n = pos.count;
          const idx = new Uint16Array(n * 4);
          const wt = new Float32Array(n * 4);
          for (let i = 0; i < n; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);
            // 0 = body; legs 1..4 = front-left, front-right, back-left, back-right.
            const leg = (z > 0.1 ? 1 : 3) + (x > 0 ? 0 : 1);
            const w = z < -0.26 ? 0 : Math.max(0, Math.min(1, (-0.1 - y) / 0.08));
            idx[i * 4] = leg;
            idx[i * 4 + 1] = 0;
            wt[i * 4] = w;
            wt[i * 4 + 1] = 1 - w;
          }
          geo.setAttribute("skinIndex", new T.Uint16BufferAttribute(idx, 4));
          geo.setAttribute("skinWeight", new T.Float32BufferAttribute(wt, 4));
          const root = new T.Bone();
          const hips: [number, number][] = [
            [0.1, 0.22],
            [-0.1, 0.22],
            [0.1, -0.15],
            [-0.1, -0.15],
          ];
          const legs = hips.map(([hx, hz]) => {
            const b = new T.Bone();
            b.position.set(hx, -0.1, hz);
            root.add(b);
            return b;
          });
          const mat = mesh.material;
          mat.skinning = true;
          mat.metalness = 0;
          mat.needsUpdate = true;
          const skinned = new T.SkinnedMesh(geo, mat);
          skinned.position.copy(mesh.position);
          skinned.quaternion.copy(mesh.quaternion);
          skinned.scale.copy(mesh.scale);
          skinned.castShadow = true;
          skinned.frustumCulled = false;
          skinned.add(root);
          skinned.bind(new T.Skeleton([root, ...legs]));
          mesh.parent.add(skinned);
          mesh.parent.remove(mesh);
          if (!wolf.legs.length) wolf.legs = legs;
        }
        // 0.74 tall in the file, feet at -0.37: stand it on the ground, about 0.95 tall.
        const k = 1.28;
        model.scale.setScalar(k);
        model.position.y = 0.37 * k;
        wolf.g.add(model);
        wolf.model = model;
      })
      .catch(() => {
        // No wolf if it can't load.
      });
  }
  // The town's monster, on a round stone in the middle.
  const monsters: Monster[] = [];
  if (who.resident) {
    const m = buildMonster(T, who.resident.element, who.resident.stage, who.resident.legend);
    // On a painted island the stone takes the island's colour instead of plain white.
    const standColour = theme.art?.island ? (theme.art.islandTrim ?? 0xa99ad6) : 0xcfc6b5;
    const stand = shadowy(new T.Mesh(new T.CylinderGeometry(0.75, 0.85, 0.16, 20), mat(standColour, 0.8)));
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
  const backdrop = theme.art?.space
    ? createSpace(T, scene, camera, {
        reduceMotion,
        picture: { url: `${theme.art.dir}/space.webp`, w: 941, h: 1672, planet: { url: "", x: 0, y: 0, px: 1, depth: 1 } },
        extras: true,
        meteor: true,
        far: 200,
      })
    : theme.art
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
  // 展示台: with the camera fixed, the plots sit in two staggered rows as seen from the camera (three at the back,
  // two in front between them) so no statue hides another. [across, toward the camera].
  // Sky (2026-10-08): evenly spaced — the five stand on the corners of a regular pentagon, so every
  // neighbour is the same distance apart; the centre one at the back faces the camera.
  const SHOW_R = 3.0;
  const SHOW_AT: [number, number][] = [-162, -90, -18, 54, 126].map((deg) => [
    Math.cos((deg * Math.PI) / 180) * SHOW_R,
    Math.sin((deg * Math.PI) / 180) * SHOW_R,
  ]);
  const plotAt: [number, number][] = showcase
    ? SHOW_AT.map(([across, near]) => [
        Math.cos(HOME_YAW) * across + Math.sin(HOME_YAW) * near,
        -Math.sin(HOME_YAW) * across + Math.cos(HOME_YAW) * near,
      ])
    : PLOT_AT;
  const plots: Plot[] = plotAt.map(([x, z], i) => {
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
    level <= 0 ? 0.3 : theme.art ? theme.art.sizes[theme.art.names[i]][level - 1][1] * ART_UNIT * growOf(level) * 0.96 + plinthOf(level, i) : ({ site: [0, 1.0, 0.95, 1.3, 1.9, 2.6], oriental: [0, 0.9, 1.25, 1.6, 1.9, 2.2], desert: [0, 0.8, 0.8, 1.0, 1.6, 1.7] } as Record<string, number[]>)[theme.style][level];
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
      // 展示台 (Sky 2026-10-08): the island turns only a little either way, then springs back on release.
      if (showcase) view.goalYaw = Math.max(HOME_YAW - SHOW_TURN, Math.min(HOME_YAW + SHOW_TURN, view.goalYaw));
    }
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (showcase && pointers.size === 0) view.goalYaw = HOME_YAW;
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
  // 起樓工人 (Sky 2026-10-01): two little builders either side of the plot, hammering (two pictures swapped)
  // while the cloud covers the building, then they hop away.
  const workerUp = new T.TextureLoader().load("/art/fx/worker-up.webp");
  const workerDown = new T.TextureLoader().load("/art/fx/worker-down.webp");
  // Mirror copies for the right-hand worker: a sprite ignores a negative scale, so the picture itself is flipped.
  const mirrored = (url: string) => {
    const m = new T.TextureLoader().load(url);
    m.wrapS = T.RepeatWrapping;
    m.repeat.x = -1;
    m.offset.x = 1;
    return m;
  };
  const workerUpFlip = mirrored("/art/fx/worker-up.webp");
  const workerDownFlip = mirrored("/art/fx/worker-down.webp");
  workerUp.encoding = workerDown.encoding = T.sRGBEncoding;
  const WORK_MS = CLOUD_END + 500;
  type Worker = { s: any; side: number; phase: number };
  const crews = new Map<number, { at: number; men: Worker[] }>();
  /** 起樓 (Sky 2026-10-02): the two characters walking round the island nearest the plot run over, hammer away
   *  beside it while the cloud covers the building, then walk back to their stroll. */
  const BACK_MS = 700;
  function sendBuilders(i: number) {
    const ready = walkers.filter((w) => w.model && !w.job);
    if (ready.length < 2) return false;
    const [px, pz] = [plots[i].holder.position.x, plots[i].holder.position.z];
    const out = Math.hypot(px, pz) || 1;
    const [ox, oz] = [px / out, pz / out];
    const [tx, tz] = [-oz, ox];
    const near = ready.sort((a, b) => Math.hypot(a.g.position.x - px, a.g.position.z - pz) - Math.hypot(b.g.position.x - px, b.g.position.z - pz)).slice(0, 2);
    const now = performance.now();
    near.forEach((w, k) => {
      const side = k ? 1 : -1;
      // On the 展示台 they hammer in front of the statue (the side facing the middle), so they never walk through it.
      const to: [number, number] = showcase
        ? [px + tx * side * 0.55 - ox * 0.75, pz + tz * side * 0.55 - oz * 0.75]
        : [px + tx * side * 0.85 + ox * 0.7, pz + tz * side * 0.85 + oz * 0.7];
      const from: [number, number] = [w.g.position.x, w.g.position.z];
      const walk = Math.min(900, Math.max(300, (Math.hypot(to[0] - from[0], to[1] - from[1]) / 4) * 1000));
      w.job = { plot: i, at: now, from, to, walk, work: Math.max(CLOUD_END + 300, walk + 1300), struck: -1 };
    });
    return true;
  }
  function buildStep(w: (typeof walkers)[number], now: number, dt: number) {
    const job = w.job!;
    const age = now - job.at;
    const [px, pz] = [plots[job.plot].holder.position.x, plots[job.plot].holder.position.z];
    const face = (dx: number, dz: number) => {
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) w.g.rotation.y = Math.atan2(dx, dz);
    };
    if (age < job.walk) {
      // Run over.
      const k = age / job.walk, e = k * k * (3 - 2 * k);
      const x = job.from[0] + (job.to[0] - job.from[0]) * e, z = job.from[1] + (job.to[1] - job.from[1]) * e;
      w.g.position.set(x, TOP + Math.abs(Math.sin(now / 90)) * 0.04, z);
      face(job.to[0] - job.from[0], job.to[1] - job.from[1]);
      w.mixer?.update(dt * 1.8);
      return;
    }
    if (age < job.work) {
      // Hammer: face the building, swing on a beat, a bob and a few sparks each strike.
      w.g.position.set(job.to[0], TOP, job.to[1]);
      face(px - job.to[0], pz - job.to[1]);
      if (w.hammer) w.hammer.visible = true;
      const t = (age - job.walk) / 260 + (job.to[0] > px ? 0.5 : 0);
      const phase = t - Math.floor(t);
      const swing = phase < 0.6 ? -1.3 * (phase / 0.6) : -1.3 + 2.1 * ((phase - 0.6) / 0.4);
      if (w.hammer) w.hammer.rotation.x = swing;
      if (w.model) w.model.rotation.x = phase > 0.6 ? 0.18 * ((phase - 0.6) / 0.4) : 0.18 * (1 - phase / 0.6);
      const beat = Math.floor(t);
      if (phase > 0.95 && job.struck !== beat && w.hammer) {
        job.struck = beat;
        burst(w.hammer.localToWorld(new T.Vector3(0, 0.17, 0)), 5, [0xffd34d, 0xffffff, 0x9fd8ff], 1.6, 0.35, 0.035, false);
      }
      return;
    }
    if (w.hammer) w.hammer.visible = false;
    if (w.model) w.model.rotation.x = 0;
    // Walk back onto the stroll round the edge, then carry on.
    const a = Math.atan2(job.to[1], job.to[0]);
    const home: [number, number] = [Math.cos(a) * w.r, Math.sin(a) * w.r];
    const k = Math.min(1, (age - job.work) / BACK_MS);
    w.g.position.set(job.to[0] + (home[0] - job.to[0]) * k, TOP + Math.abs(Math.sin(now / 160)) * 0.03, job.to[1] + (home[1] - job.to[1]) * k);
    face(home[0] - job.to[0], home[1] - job.to[1]);
    w.mixer?.update(dt);
    if (k >= 1) {
      w.a = a;
      w.job = undefined;
    }
  }
  function hireCrew(i: number) {
    if (sendBuilders(i)) return;
    // Sky (2026-10-07): no more yellow-hat sprite workers on the picture pages. If the characters aren't
    // free (still loading or busy), the cloud does the building on its own.
    if (theme.art) return;
    const p = plots[i];
    const old = crews.get(i);
    if (old) for (const w of old.men) p.holder.remove(w.s);
    const men = [-1, 1].map((side, k) => {
      const s = new T.Sprite(new T.SpriteMaterial({ map: workerUp, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      s.center.set(0.5, 0.05);
      s.renderOrder = 9;
      s.userData.off = [side * 0.9, 0.02];
      p.holder.add(s);
      return { s, side, phase: k * 0.5 };
    });
    crews.set(i, { at: performance.now(), men });
  }
  function crewStep(i: number, now: number) {
    const crew = crews.get(i);
    if (!crew) return;
    const p = plots[i];
    const age = now - crew.at;
    if (age > WORK_MS) {
      for (const w of crew.men) {
        p.holder.remove(w.s);
        w.s.material.dispose();
      }
      crews.delete(i);
      return;
    }
    const inn = Math.min(1, age / 200), out = age > WORK_MS - 300 ? (WORK_MS - age) / 300 : 1;
    for (const w of crew.men) {
      const beat = Math.floor(age / 170 + w.phase * 2) % 2;
      w.s.material.map = w.side > 0 ? (beat ? workerDownFlip : workerUpFlip) : beat ? workerDown : workerUp;
      w.s.material.opacity = Math.min(inn, out);
      // Facing in towards the building: the pictures face right, so the right-hand worker is flipped.
      // Smaller workers (Sky 2026-10-01), closer in to the building.
      const size = 0.85;
      w.s.scale.set(size, size, 1);
      // Either side of the picture on screen (pinned like the sails, so turning the island never hides them).
      w.s.userData.off = [w.side * 0.62, 0.02 + (beat ? 0 : 0.04) + (1 - out) * 0.4];
    }
  }
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
    if (next > Math.max(0, p.level)) hireCrew(i);
    if (showcase && next > Math.max(0, p.level) && !reduceMotion) {
      focusAt.copy(worldOf(i, heightOf(next, i) * 0.45));
      focusFrom = performance.now();
      focusLevel = next;
    }
  }
  function cloudStep(i: number, now: number) {
    const p = plots[i];
    const age = now - p.cloudAt;
    if (p.pending !== null && age >= CLOUD_SWAP) {
      draw(i, p.pending);
      p.pending = null;
      p.popAt = now;
      burst(worldOf(i, heightOf(p.level, i) * 0.6), 26, [0xffd34d, 0xffffff, 0x7dd3fc], 3.2, 0.9, 0.07, false);
      if (showcase && p.level >= 4) {
        // The top levels arrive with a bigger shower of crystal and gold.
        burst(worldOf(i, heightOf(p.level, i) * 0.9), p.level >= 5 ? 60 : 30, [0xffd75a, 0xffffff, 0xc58bff, 0x9fe8ff], 4.5, 1.4, 0.09, false);
      }
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
  // 瞄準虛線 (Sky 2026-10-02, in place of the red rings): while choosing what to attack, a blinking dotted line of
  // little flames runs from your dragon to one building at a time, hopping round every building you can hit.
  const AIM_DOTS = 12, AIM_HOP = 1300;
  const aimTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "#ffffff";
    x.beginPath();
    x.arc(32, 32, 26, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#ff4a1c";
    x.beginPath();
    x.arc(32, 32, 19, 0, Math.PI * 2);
    x.fill();
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  })();
  const aimDots = Array.from({ length: AIM_DOTS }, () => {
    const d = new T.Sprite(new T.SpriteMaterial({ map: aimTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
    d.renderOrder = 9;
    scene.add(d);
    return d;
  });
  let aimAt = -1;
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
  const holePic = picTex("/art/fx/blackhole.webp");
  /**
   * 黑洞 (Sky 2026-10-02, in place of the shield): a swirling black hole opens in the fireball's path.
   * Not broken: it swallows the fireball — spinning it in, shrinking it to nothing — then snaps shut.
   * Broken: it strains, warps and bursts apart, and the fireball carries on to the building.
   */
  function blackHoleAt(spot: any, broken: boolean) {
    const SIZE = 2.6;
    const hole = glowSprite(holePic, 0xffffff, false);
    hole.renderOrder = 8;
    hole.position.copy(spot);
    hole.material.opacity = 0;
    const glow = glowSprite(fireTex, 0xb04cff);
    glow.renderOrder = 7;
    glow.position.copy(spot);
    glow.material.opacity = 0;
    const open = broken ? FIRE_MS * 0.55 : FIRE_MS - 480;
    const hit = broken ? FIRE_MS * 0.85 : FIRE_MS;
    const end = broken ? hit + 380 : hit + 900;
    addFx(open, end - open, (k, now) => {
      const t = open + k * (end - open);
      const grow = Math.min(1, (t - open) / 260);
      let size = SIZE * (grow < 1 ? grow * (1.1 - 0.1 * grow) : 1);
      if (!broken && t > hit) {
        // Gulp, then close.
        const after = (t - hit) / (end - hit);
        size *= after < 0.35 ? 1 + 0.18 * Math.sin((after / 0.35) * Math.PI) : 1 - (after - 0.35) / 0.65;
      }
      let sx = size, sy = size;
      if (broken && t > hit - 160) {
        // Straining against the fireball, then flying apart.
        const strain = Math.min(1, (t - (hit - 160)) / 160);
        sx = size * (1 + 0.35 * strain * Math.abs(Math.sin(t / 30)));
        sy = size * (1 - 0.25 * strain * Math.abs(Math.cos(t / 30)));
        if (t > hit) {
          const after = (t - hit) / (end - hit);
          sx *= 1 + after * 1.2;
          sy *= 1 + after * 1.2;
        }
      }
      hole.scale.set(sx, sy, 1);
      hole.material.rotation = -now / (broken && t > hit - 160 ? 90 : 220);
      const fade = broken && t > hit ? 1 - (t - hit) / (end - hit) : 1;
      hole.material.opacity = Math.min(1, grow * 1.4) * fade;
      glow.scale.setScalar(sx * 1.5);
      glow.material.opacity = 0.55 * Math.min(1, grow) * fade;
    }, () => {
      drop(hole);
      drop(glow);
    });
    if (broken) {
      addFx(hit, 10, () => undefined, () => {
        shakeAll = performance.now();
        burst(spot, 44, [0xb04cff, 0xff5fd2, 0xffffff, 0x6a3cff], 5.5, 0.9, 0.09, false);
      });
      return;
    }
    // The swallowed fireball: spirals into the middle, shrinking, then a little purple pop as it shuts.
    const ember = glowSprite(fireballPic, 0xffffff, false);
    ember.center.set(0.33, 0.37);
    ember.material.opacity = 0;
    addFx(hit, 520, (k) => {
      const a = k * Math.PI * 5, r = 0.55 * (1 - k);
      ember.position.set(spot.x + Math.cos(a) * r, spot.y + Math.sin(a) * r * 0.8, spot.z);
      ember.scale.setScalar(1.5 * (1 - k) + 0.05);
      ember.material.rotation = a;
      ember.material.opacity = 1 - k * 0.6;
    }, () => drop(ember));
    addFx(hit + 520, 10, () => undefined, () => burst(spot, 24, [0xb04cff, 0xff5fd2, 0xffffff], 3, 0.6, 0.06, false));
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
  const focusAt = new T.Vector3(), focusNow = new T.Vector3();
  let focusFrom = -1e9, focusLevel = 0;
  const FOCUS_IN = 500, FOCUS_HOLD = 1500, FOCUS_OUT = 700;
  function focusLean(now: number) {
    const age = now - focusFrom;
    if (age < 0 || age > FOCUS_IN + FOCUS_HOLD + FOCUS_OUT) return 0;
    const ease = (k: number) => k * k * (3 - 2 * k);
    if (age < FOCUS_IN) return ease(age / FOCUS_IN);
    if (age < FOCUS_IN + FOCUS_HOLD) return 1;
    return 1 - ease((age - FOCUS_IN - FOCUS_HOLD) / FOCUS_OUT);
  }
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
    auraStep(now);
    plots.forEach((_, i) => {
      cloudStep(i, now);
      crewStep(i, now);
    });
    for (const p of plots) {
      const k = Math.min(1, (now - p.popAt) / 450);
      const s = k < 1 ? 0.5 + 0.5 * k + Math.sin(k * Math.PI) * 0.25 : 1;
      if (p.body) p.body.scale.setScalar(s);
      const shake = Math.max(0, 1 - (now - p.shakeAt) / 400);
      if (p.body) p.body.rotation.z = shake ? Math.sin(now / 25) * 0.12 * shake : 0;
      p.ring.material.opacity = 0;
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
    if (wolf.model) {
      if (!reduceMotion) wolf.a += wolf.speed * dt;
      // A trot: diagonal pairs swing together (front-left with back-right), the body only dips a touch.
      const step = reduceMotion ? 0 : now / 220;
      const swing = Math.sin(step) * 0.32;
      const [fl, fr, bl, br] = wolf.legs;
      if (fl) {
        fl.rotation.x = swing;
        br.rotation.x = swing;
        fr.rotation.x = -swing;
        bl.rotation.x = -swing;
      }
      wolf.g.position.set(Math.cos(wolf.a) * wolf.r, TOP - Math.abs(Math.cos(step)) * 0.015, Math.sin(wolf.a) * wolf.r);
      wolf.g.rotation.y = -wolf.a + (wolf.speed > 0 ? 0 : Math.PI);
    }
    for (const w of walkers) {
      if (w.job) {
        buildStep(w, now, dt);
        continue;
      }
      if (!reduceMotion) w.a += w.speed * dt;
      w.g.position.set(Math.cos(w.a) * w.r, TOP + Math.abs(Math.sin(now / 160 + w.phase)) * 0.03, Math.sin(w.a) * w.r);
      w.g.rotation.y = -w.a + (w.speed > 0 ? 0 : Math.PI);
      w.mixer?.update(dt);
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
    {
      const standing = plots.map((p, i) => (p.level > 0 ? i : -1)).filter((i) => i >= 0);
      const aiming = targets && !!attacker && standing.length > 0 && now - lungeState.at > 900;
      aimAt = aiming ? standing[Math.floor(now / AIM_HOP) % standing.length] : -1;
      if (aimAt >= 0 && attacker) {
        const from = attacker.group.position.clone().add(new T.Vector3(0, 0.6, 0));
        const to = worldOf(aimAt, Math.max(0.5, heightOf(plots[aimAt].level, aimAt) * 0.6));
        // The dragon looks where it's aiming.
        attacker.group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        const hop = (now % AIM_HOP) / AIM_HOP;
        const reach = Math.min(1, hop / 0.3);
        const blink = 0.55 + 0.45 * Math.abs(Math.sin(now / 160));
        aimDots.forEach((d, n) => {
          const k = ((n + (now / 90) % 1) / AIM_DOTS) * reach;
          d.position.lerpVectors(from, to, k);
          d.position.y += Math.sin(k * Math.PI) * 1.1;
          d.scale.setScalar(n === AIM_DOTS - 1 ? 0.42 : 0.22);
          d.material.opacity = blink * (k <= reach ? 1 : 0) * (hop > 0.92 ? (1 - hop) / 0.08 : 1);
        });
        // The building being aimed at throbs a little.
        const b = plots[aimAt].body;
        if (b && now - plots[aimAt].popAt > 450) b.scale.setScalar(1 + 0.06 * Math.abs(Math.sin(now / 140)));
      } else aimDots.forEach((d) => (d.material.opacity = 0));
    }
    view.idle += dt;
    view.yaw += (view.goalYaw - view.yaw) * Math.min(1, dt * 8);
    view.elev += (view.goalElev - view.elev) * Math.min(1, dt * 8);
    view.dist += (view.goalDist - view.dist) * Math.min(1, dt * 6);
    const sway = reduceMotion ? 0 : Math.sin(now / 7000) * (showcase ? 0.06 : 0.15) * Math.min(1, Math.max(0, view.idle - 2) / 3);
    const yaw = view.yaw + sway, flatD = Math.cos(view.elev) * view.dist;
    // 展示台: on a level-up the camera leans in toward the building, then eases back.
    const lean = showcase ? focusLean(now) : 0;
    focusNow.set(0, AIM_Y, 0).lerp(focusAt, lean);
    const d = 1 - lean * (focusLevel >= 5 ? 0.38 : 0.28);
    camera.position.set(focusNow.x + Math.sin(yaw) * flatD * d, focusNow.y + Math.sin(view.elev) * view.dist * d, focusNow.z + Math.cos(yaw) * flatD * d);
    camera.lookAt(focusNow);
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
        // Stop in front of the building, where the black hole opens.
        const c = plot ? worldOf(index!, 0) : new T.Vector3(0, 0, 0);
        aim.copy(c).add(mouth.clone().sub(c).setY(0).normalize().multiplyScalar((plot ? 1.3 : 1.7) * 1.05));
        aim.y = TOP + 1.35;
      }
      fireball(mouth, aim);
      if (result === "block") {
        blackHoleAt(aim, false);
        return;
      }
      if (result === "break") {
        // Where the fireball will be most of the way there (the same arc the fireball flies).
        const p = new T.Vector3().lerpVectors(mouth, to, 0.85);
        p.y += Math.sin(0.85 * Math.PI) * 1.4;
        blackHoleAt(p, true);
      }
      addFx(FIRE_MS, 10, () => undefined, () => {
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
