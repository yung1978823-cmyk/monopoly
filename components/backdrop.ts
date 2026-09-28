/**
 * A lively "pseudo-3D" world under and around the floating islands: flat painted cards set at
 * different depths, so they slide past each other as the camera turns. Far below lies a busy
 * little town by a river (boats sail it, carts go round the ring road, windmills turn, chimneys
 * smoke, the water glints); in between drift clouds, hot-air balloons, airships and a flock of
 * birds; and soft sunbeams sway across the view. Everything is drawn in code on canvases — no
 * image files — and one call per frame moves it all.
 */
export type Backdrop = {
  /** Call every frame. */
  update(now: number, dt: number): void;
};

type Options = {
  /** Height of the town far below. */
  groundY: number;
  /** Width of the town card (it should fill the view below). */
  size: number;
  /** How far the haze starts and ends. */
  fogNear: number;
  fogFar: number;
  /** Scales the in-between things (clouds, balloons, ships, birds) to the scene. */
  scale?: number;
  reduceMotion?: boolean;
};

const HAZE = 0xa8c8ec;

/** A tiny repeatable random-number maker, so the town looks the same every time. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

/** The river's course across the town card, t from 0 to 1, in -0.5…0.5 card units. */
function riverAt(t: number): [number, number] {
  const u = -0.55 + t * 1.1;
  return [u, 0.16 * Math.sin(t * 5.2 + 0.6) + (t - 0.5) * 0.25 + 0.05];
}
const TOWN = { u: 0.06, v: -0.08, r: 0.2 };

export function createBackdrop(T: any, scene: any, camera: any, opts: Options): Backdrop {
  const S = opts.size;
  /** World units per pixel of the town card (things on the ground are sized in card pixels). */
  const px = S / 2048;
  const k = opts.scale ?? 1;
  const still = !!opts.reduceMotion;
  const tex = (c: HTMLCanvasElement) => {
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  };
  const sprite = (map: any, extra: Record<string, unknown> = {}) =>
    new T.Sprite(new T.SpriteMaterial(Object.assign({ map, transparent: true, depthWrite: false }, extra)));
  const world = (u: number, v: number, y = opts.groundY) => new T.Vector3(u * S, y, v * S);

  // ---------- Sky and haze: a bright day ----------
  {
    const { c, g } = canvas(4, 512);
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#3a78d8");
    grad.addColorStop(0.45, "#7fbaf0");
    grad.addColorStop(0.8, "#cfe3f7");
    grad.addColorStop(1, "#ffe2bd");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 512);
    scene.background = tex(c);
    scene.fog = new T.Fog(HAZE, opts.fogNear, opts.fogFar);
  }

  // ---------- The town far below ----------
  const rnd = seeded(20260928);
  {
    const N = 2048;
    const { c, g } = canvas(N, N);
    const P = (u: number) => (u + 0.5) * N;
    // Meadow with soft patches.
    g.fillStyle = "#86bb5c";
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = ["#7bb055", "#93c566", "#79a94f", "#9fcb6e"][i % 4];
      g.globalAlpha = 0.5;
      g.beginPath();
      g.ellipse(rnd() * N, rnd() * N, 30 + rnd() * 90, 20 + rnd() * 60, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // Patchwork fields out of town.
    for (let i = 0; i < 260; i++) {
      const u = rnd() - 0.5, v = rnd() - 0.5;
      if (Math.hypot(u - TOWN.u, v - TOWN.v) < TOWN.r + 0.05) continue;
      g.save();
      g.translate(P(u), P(v));
      g.rotate(rnd() * Math.PI);
      const w = 30 + rnd() * 60, h = 22 + rnd() * 44;
      g.fillStyle = ["#c9d46a", "#a7c75a", "#e2c86a", "#8fbf5a", "#d7b35a"][i % 5];
      g.fillRect(-w / 2, -h / 2, w, h);
      g.strokeStyle = "rgba(90,120,50,0.35)";
      g.lineWidth = 2;
      for (let s = -w / 2 + 3; s < w / 2; s += 5) {
        g.beginPath();
        g.moveTo(s, -h / 2);
        g.lineTo(s, h / 2);
        g.stroke();
      }
      g.restore();
    }
    // The river, with lighter banks.
    const river = (width: number, colour: string) => {
      g.strokeStyle = colour;
      g.lineWidth = width;
      g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const [u, v] = riverAt(i / 120);
        if (i === 0) g.moveTo(P(u), P(v));
        else g.lineTo(P(u), P(v));
      }
      g.stroke();
    };
    river(40, "#d9cf9a");
    river(30, "#3f97d6");
    river(12, "#5bb2ea");
    // Roads: a ring round the town and spokes out.
    g.strokeStyle = "#e8dcb4";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(P(TOWN.u), P(TOWN.v), TOWN.r * N, 0, Math.PI * 2);
    g.stroke();
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.moveTo(P(TOWN.u) + Math.cos(a) * 40, P(TOWN.v) + Math.sin(a) * 40);
      g.lineTo(P(TOWN.u) + Math.cos(a) * N * 0.5, P(TOWN.v) + Math.sin(a) * N * 0.5);
      g.stroke();
    }
    // A bridge where the river meets the ring.
    // Houses: rows of little roofs inside the ring, a few out along the roads.
    const roofs = ["#d9573b", "#e8873a", "#c94a5a", "#3c9ab0", "#8b5fbf", "#e0b040", "#b5553a"];
    const houses: [number, number][] = [];
    for (let i = 0; i < 6000 && houses.length < 1600; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (TOWN.r + 0.05);
      const u = TOWN.u + Math.cos(a) * d, v = TOWN.v + Math.sin(a) * d;
      if (d < 0.03) continue;
      let nearRiver = false;
      for (let t = 0; t <= 1; t += 0.02) {
        const [ru, rv] = riverAt(t);
        if (Math.hypot(ru - u, rv - v) < 0.016) nearRiver = true;
      }
      if (nearRiver || Math.abs(Math.hypot(u - TOWN.u, v - TOWN.v) - TOWN.r) < 0.005) continue;
      houses.push([u, v]);
      g.save();
      g.translate(P(u), P(v));
      g.rotate(a + (rnd() < 0.5 ? 0 : Math.PI / 2));
      const w = 7 + rnd() * 5, h = 5 + rnd() * 4;
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(-w / 2 + 1.5, -h / 2 + 1.5, w, h);
      const roof = roofs[Math.floor(rnd() * roofs.length)];
      g.fillStyle = roof;
      g.fillRect(-w / 2, -h / 2, w, h / 2);
      g.fillStyle = shade(roof, -0.25);
      g.fillRect(-w / 2, 0, w, h / 2);
      g.restore();
    }
    // The castle in the middle.
    g.save();
    g.translate(P(TOWN.u), P(TOWN.v));
    g.scale(0.55, 0.55);
    g.fillStyle = "#cfc8b8";
    g.fillRect(-34, -34, 68, 68);
    g.fillStyle = "#2f5fae";
    g.fillRect(-24, -24, 48, 24);
    g.fillStyle = "#244a8a";
    g.fillRect(-24, 0, 48, 24);
    for (const [x, y] of [[-34, -34], [34, -34], [-34, 34], [34, 34]]) {
      g.fillStyle = "#b9b2a2";
      g.beginPath();
      g.arc(x, y, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#e0c040";
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // Trees: clumps out of town.
    for (let i = 0; i < 3500; i++) {
      const u = rnd() - 0.5, v = rnd() - 0.5;
      if (Math.hypot(u - TOWN.u, v - TOWN.v) < TOWN.r + 0.02) continue;
      const x = P(u), y = P(v), r = 3 + rnd() * 4;
      g.fillStyle = "rgba(0,0,0,0.22)";
      g.beginPath();
      g.arc(x + 1.5, y + 1.5, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ["#3f8a3a", "#4f9c3f", "#2f7a38"][i % 3];
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(255,255,220,0.25)";
      g.beginPath();
      g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2);
      g.fill();
    }
    const ground = new T.Mesh(new T.PlaneGeometry(S, S), new T.MeshBasicMaterial({ map: tex(c) }));
    ground.material.map.anisotropy = 4;
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = opts.groundY;
    scene.add(ground);
    houseSpots = houses;
  }

  // ---------- Things that move on the ground ----------
  const movers: ((t: number, dt: number) => void)[] = [];
  // Glints on the water.
  {
    const n = 160, pos = new Float32Array(n * 3), phase: number[] = [];
    for (let i = 0; i < n; i++) {
      const [u, v] = riverAt(Math.random());
      const p = world(u + (Math.random() - 0.5) * 0.012, v + (Math.random() - 0.5) * 0.012, opts.groundY + 0.2);
      pos.set([p.x, p.y, p.z], i * 3);
      phase.push(Math.random() * 10);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    const glints = new T.Points(geo, new T.PointsMaterial({ size: 5 * px, map: dotTex(T), color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    scene.add(glints);
    movers.push((t) => {
      glints.material.opacity = 0.55 + Math.sin(t * 2.3) * 0.25;
    });
  }
  // Boats sailing the river.
  {
    const boat = boatTex(T);
    for (let i = 0; i < 5; i++) {
      const b = sprite(boat);
      b.scale.set(16 * px, 16 * px, 1);
      scene.add(b);
      const speed = 0.012 + Math.random() * 0.01, start = Math.random(), dir = i % 2 ? 1 : -1;
      movers.push((t) => {
        const f = (((start + dir * t * speed) % 1) + 1) % 1;
        const [u, v] = riverAt(f);
        b.position.copy(world(u, v, opts.groundY + 1));
      });
    }
  }
  // Carts going round the ring road.
  {
    const n = 30, pos = new Float32Array(n * 3), cols = new Float32Array(n * 3), spd: number[] = [], off: number[] = [];
    const palette = [0xffffff, 0xffd34d, 0xe8573b, 0x3b82f6].map((c) => new T.Color(c));
    for (let i = 0; i < n; i++) {
      spd.push((Math.random() < 0.5 ? -1 : 1) * (0.05 + Math.random() * 0.05));
      off.push(Math.random() * Math.PI * 2);
      const c = palette[i % palette.length];
      cols.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("color", new T.BufferAttribute(cols, 3));
    const carts = new T.Points(geo, new T.PointsMaterial({ size: 5 * px, vertexColors: true, map: dotTex(T), transparent: true, depthWrite: false }));
    scene.add(carts);
    movers.push((t) => {
      const p = geo.attributes.position;
      for (let i = 0; i < n; i++) {
        const a = off[i] + t * spd[i];
        const w = world(TOWN.u + Math.cos(a) * TOWN.r, TOWN.v + Math.sin(a) * TOWN.r, opts.groundY + 0.3);
        p.setXYZ(i, w.x, w.y, w.z);
      }
      p.needsUpdate = true;
    });
  }
  // Windmills out in the fields.
  {
    const tower = windmillTex(T), blades = bladesTex(T);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.7, d = TOWN.r + 0.06 + Math.random() * 0.12;
      const base = world(TOWN.u + Math.cos(a) * d, TOWN.v + Math.sin(a) * d);
      const sz = 26 * px;
      const t1 = sprite(tower);
      t1.center.set(0.5, 0);
      t1.scale.set(sz * 0.6, sz, 1);
      t1.position.copy(base);
      const b = sprite(blades);
      b.scale.set(sz * 1.1, sz * 1.1, 1);
      b.position.copy(base).add(new T.Vector3(0, sz * 0.82, 0));
      scene.add(t1, b);
      const spin = 0.6 + Math.random() * 0.5;
      movers.push((t) => (b.material.rotation = t * spin));
    }
  }
  // Chimney smoke from some houses.
  {
    const puff = softTex(T, "rgba(255,255,255,0.8)", "rgba(255,255,255,0)");
    const spots = houseSpots.filter((_, i) => i % 60 === 0).slice(0, 24);
    spots.forEach(([u, v], i) => {
      for (let j = 0; j < 3; j++) {
        const s = sprite(puff, { opacity: 0.6 });
        scene.add(s);
        const at = world(u, v), off = (j / 3) * 4 + i * 0.37;
        movers.push((t) => {
          const f = ((t + off) % 4) / 4;
          s.position.set(at.x + f * 8 * px, at.y + 1 + f * 30 * px, at.z);
          const sz = (5 + f * 14) * px;
          s.scale.set(sz, sz, 1);
          s.material.opacity = 0.55 * (1 - f);
        });
      }
    });
  }

  // ---------- In between: clouds, balloons, airships, birds ----------
  {
    const cloud = cloudTex(T);
    for (let i = 0; i < 22; i++) {
      const c = sprite(cloud, { opacity: 0.8 });
      const sz = (10 + Math.random() * 12) * k;
      c.scale.set(sz, sz * 0.5, 1);
      const y = -8 * k - Math.random() * 30 * k;
      const z = (Math.random() - 0.5) * 160 * k, x0 = (Math.random() - 0.5) * 180 * k, speed = (0.6 + Math.random() * 0.6) * k;
      scene.add(c);
      movers.push((t) => {
        const span = 180 * k;
        c.position.set(((((x0 + t * speed) % span) + span * 1.5) % span) - span / 2, y, z);
      });
    }
  }
  {
    const colours = [["#e8573b", "#ffd34d"], ["#3b82f6", "#ffffff"], ["#16a34a", "#fbd000"], ["#a855f7", "#f9a8d4"], ["#f97316", "#1e3a8a"]];
    colours.forEach((pair, i) => {
      const b = sprite(balloonTex(T, pair[0], pair[1]));
      const sz = (2.2 + Math.random() * 1.2) * k;
      b.scale.set(sz, sz * 1.25, 1);
      scene.add(b);
      const a0 = Math.random() * Math.PI * 2, r = (16 + Math.random() * 22) * k, y0 = opts.groundY * (0.1 + Math.random() * 0.35);
      movers.push((t) => {
        const a = a0 + t * 0.02;
        b.position.set(Math.cos(a) * r, y0 + Math.sin(t * 0.5 + i) * 0.8 * k, Math.sin(a) * r);
      });
    });
  }
  {
    const ship = airshipTex(T);
    for (let i = 0; i < 2; i++) {
      const s = sprite(ship);
      const sz = 6 * k;
      s.scale.set(sz, sz * 0.4, 1);
      scene.add(s);
      const r = (30 + i * 9) * k, y = (i ? -3 : opts.groundY * 0.2) * 1, a0 = i * 2.5, dir = i ? 1 : -1;
      const prev = new T.Vector3();
      movers.push((t) => {
        const a = a0 + dir * t * 0.03;
        prev.copy(s.position);
        s.position.set(Math.cos(a) * r, y + Math.sin(t * 0.7 + i) * 0.4 * k, Math.sin(a) * r);
        // Face the way it's heading on screen.
        const now = s.position.clone().project(camera), before = prev.project(camera);
        const goingRight = now.x >= before.x;
        s.scale.x = Math.abs(s.scale.x) * (goingRight ? 1 : -1);
      });
    }
  }
  {
    const up = birdTex(T, true), down = birdTex(T, false);
    const flock = new T.Group();
    scene.add(flock);
    const birds: any[] = [];
    for (let i = 0; i < 7; i++) {
      const b = sprite(up);
      b.scale.set(0.9 * k, 0.45 * k, 1);
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      b.position.set(-row * 1.1 * k, 0, side * row * 0.9 * k);
      flock.add(b);
      birds.push(b);
    }
    movers.push((t) => {
      const a = t * 0.05, r = 26 * k;
      flock.position.set(Math.cos(a) * r, 2 * k + Math.sin(t * 0.3) * 1.5 * k, Math.sin(a) * r);
      flock.rotation.y = -a - Math.PI / 2;
      birds.forEach((b, i) => (b.material.map = Math.sin(t * 9 + i * 0.7) > 0 ? up : down));
    });
  }

  // ---------- Sunbeams sweeping slowly across the view ----------
  {
    const beam = beamTex(T);
    const rays = new T.Group();
    camera.add(rays);
    if (!camera.parent) scene.add(camera);
    const list: { s: any; phase: number; base: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const s = sprite(beam, { blending: T.AdditiveBlending, opacity: 0.18, color: 0xfff1c8, fog: false, depthTest: true });
      s.scale.set(6 + i * 1.5, 70, 1);
      const base = -0.55 + i * 0.12;
      s.material.rotation = base;
      s.position.set(-22 + i * 7, 12, -60);
      rays.add(s);
      list.push({ s, phase: i * 1.3, base });
    }
    movers.push((t) => {
      for (const r of list) {
        r.s.material.opacity = 0.1 + (Math.sin(t * 0.4 + r.phase) * 0.5 + 0.5) * 0.14;
        r.s.material.rotation = r.base + Math.sin(t * 0.15 + r.phase) * 0.05;
      }
    });
  }

  let clock = 0;
  movers.forEach((m) => m(0, 0));
  return {
    update(_now, dt) {
      if (still) return;
      clock += dt;
      for (const m of movers) m(clock, dt);
    },
  };
}

let houseSpots: [number, number][] = [];

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 + amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function mk(T: any, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.encoding = T.sRGBEncoding;
  return t;
}

function softTex(T: any, inner: string, outer: string) {
  return mk(T, 64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, inner);
    r.addColorStop(1, outer);
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
}
const dotTex = (T: any) => softTex(T, "rgba(255,255,255,1)", "rgba(255,255,255,0)");

function cloudTex(T: any) {
  return mk(T, 256, 128, (g) => {
    const puffs = [[70, 78, 38], [110, 60, 46], [160, 66, 40], [196, 82, 30], [128, 88, 40], [50, 92, 24]];
    for (const [x, y, r] of puffs) {
      const grad = g.createRadialGradient(x, y - r * 0.3, r * 0.2, x, y, r);
      grad.addColorStop(0, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.7, "rgba(240,246,255,0.85)");
      grad.addColorStop(1, "rgba(220,232,250,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function balloonTex(T: any, a: string, b: string) {
  return mk(T, 128, 160, (g) => {
    g.save();
    g.beginPath();
    g.ellipse(64, 60, 48, 56, 0, 0, Math.PI * 2);
    g.clip();
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect(16 + i * 16, 0, 16, 120);
    }
    const shine = g.createLinearGradient(16, 0, 112, 0);
    shine.addColorStop(0, "rgba(0,0,0,0.25)");
    shine.addColorStop(0.35, "rgba(255,255,255,0.25)");
    shine.addColorStop(1, "rgba(0,0,0,0.3)");
    g.fillStyle = shine;
    g.fillRect(0, 0, 128, 120);
    g.restore();
    g.strokeStyle = "#5c3a1a";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(40, 104);
    g.lineTo(54, 138);
    g.moveTo(88, 104);
    g.lineTo(74, 138);
    g.stroke();
    g.fillStyle = "#8b5a2b";
    g.fillRect(52, 136, 24, 18);
  });
}

function airshipTex(T: any) {
  return mk(T, 256, 102, (g) => {
    const body = g.createLinearGradient(0, 10, 0, 70);
    body.addColorStop(0, "#f4f0e6");
    body.addColorStop(1, "#b8b0a0");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(120, 40, 100, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e8573b";
    g.fillRect(60, 30, 120, 8);
    g.fillStyle = "#c94a3a";
    g.beginPath();
    g.moveTo(20, 40);
    g.lineTo(0, 12);
    g.lineTo(34, 30);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(20, 40);
    g.lineTo(0, 68);
    g.lineTo(34, 50);
    g.closePath();
    g.fill();
    g.fillStyle = "#6b4a2b";
    g.fillRect(96, 70, 50, 16);
    g.fillStyle = "#ffe08a";
    for (let i = 0; i < 4; i++) g.fillRect(100 + i * 12, 74, 7, 7);
    g.strokeStyle = "#555";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(222, 30);
    g.lineTo(222, 52);
    g.stroke();
  });
}

function birdTex(T: any, up: boolean) {
  return mk(T, 64, 32, (g) => {
    g.strokeStyle = "#2a2f45";
    g.lineWidth = 4;
    g.lineCap = "round";
    g.beginPath();
    if (up) {
      g.moveTo(6, 8);
      g.quadraticCurveTo(20, 10, 32, 22);
      g.quadraticCurveTo(44, 10, 58, 8);
    } else {
      g.moveTo(6, 24);
      g.quadraticCurveTo(20, 14, 32, 18);
      g.quadraticCurveTo(44, 14, 58, 24);
    }
    g.stroke();
  });
}

function boatTex(T: any) {
  return mk(T, 64, 64, (g) => {
    g.fillStyle = "#7a4a22";
    g.beginPath();
    g.moveTo(10, 44);
    g.lineTo(54, 44);
    g.lineTo(46, 54);
    g.lineTo(18, 54);
    g.closePath();
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(32, 8);
    g.lineTo(32, 42);
    g.lineTo(52, 42);
    g.closePath();
    g.fill();
    g.fillStyle = "#e8573b";
    g.beginPath();
    g.moveTo(30, 14);
    g.lineTo(30, 42);
    g.lineTo(14, 42);
    g.closePath();
    g.fill();
  });
}

function windmillTex(T: any) {
  return mk(T, 64, 128, (g) => {
    g.fillStyle = "#efe6d2";
    g.beginPath();
    g.moveTo(18, 128);
    g.lineTo(46, 128);
    g.lineTo(40, 40);
    g.lineTo(24, 40);
    g.closePath();
    g.fill();
    g.fillStyle = "#b5553a";
    g.beginPath();
    g.moveTo(18, 42);
    g.lineTo(32, 18);
    g.lineTo(46, 42);
    g.closePath();
    g.fill();
    g.fillStyle = "#6b4a2b";
    g.fillRect(28, 104, 8, 24);
  });
}

function bladesTex(T: any) {
  return mk(T, 128, 128, (g) => {
    g.translate(64, 64);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = "#8b5a2b";
      g.fillRect(-2, 0, 4, 60);
      g.fillStyle = "rgba(255,250,235,0.95)";
      g.fillRect(3, 14, 12, 44);
    }
    g.fillStyle = "#5c3a1a";
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fill();
  });
}

function beamTex(T: any) {
  return mk(T, 64, 512, (g) => {
    const across = g.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, "rgba(255,255,255,0)");
    across.addColorStop(0.5, "rgba(255,255,255,1)");
    across.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = across;
    g.fillRect(0, 0, 64, 512);
    g.globalCompositeOperation = "destination-in";
    const along = g.createLinearGradient(0, 0, 0, 512);
    along.addColorStop(0, "rgba(0,0,0,1)");
    along.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = along;
    g.fillRect(0, 0, 64, 512);
  });
}


/**
 * Outer space behind the board: a painted portrait picture that stays behind the board like a
 * phone wallpaper (the board turns in front of it), sized to cover the screen with a little spare
 * so it can slide a touch as you turn the camera — the far picture slides least, the little planet
 * and stars more, which gives depth. On top: stars twinkle, shooting stars streak by, nebula glows
 * drift and breathe, the small blue planet floats and turns, and stardust drifts round the board.
 */
type SpacePicture = { url: string; w: number; h: number; planet: { url: string; x: number; y: number; px: number; depth: number } };
/** The first-layer board's picture (the small blue planet top right is cut out so it can float). */
export const BOARD_SPACE: SpacePicture = { url: "/art/space.webp", w: 941, h: 1672, planet: { url: "/art/space-planet.webp", x: 826, y: 162, px: 114, depth: 1.35 } };
/** The public table's picture (its striped planet top right is cut out). */
export const TABLE_SPACE: SpacePicture = { url: "/art/table-space.webp", w: 941, h: 1672, planet: { url: "/art/table-planet.webp", x: 792, y: 174, px: 154, depth: 1 } };

export function createSpace(
  T: any,
  scene: any,
  camera: any,
  opts: { reduceMotion?: boolean; picture?: SpacePicture; extras?: boolean; far?: number; meteor?: boolean; ringed?: boolean; rocks?: boolean },
): Backdrop {
  const still = !!opts.reduceMotion;
  const pic = opts.picture ?? BOARD_SPACE;
  const extras = opts.extras ?? true;
  const IMG_W = pic.w, IMG_H = pic.h, D = opts.far ?? 200;
  const PLANET = { u: pic.planet.x / IMG_W, v: pic.planet.y / IMG_H, size: pic.planet.px / IMG_W };
  const load = (url: string) => {
    const t = new T.TextureLoader().load(url);
    t.encoding = T.sRGBEncoding;
    return t;
  };
  scene.background = new T.Color(0x1c1f5a).convertSRGBToLinear();
  scene.fog = new T.Fog(new T.Color(0x262a70).convertSRGBToLinear(), 40, 160);
  if (!camera.parent) scene.add(camera);
  const sky = new T.Group();
  camera.add(sky);
  const back = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: load(pic.url), depthWrite: false, fog: false, toneMapped: false }));
  back.position.z = -D;
  back.renderOrder = -100;
  sky.add(back);
  const flat = (map: any, extra: Record<string, unknown> = {}) =>
    new T.Sprite(new T.SpriteMaterial(Object.assign({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false }, extra)));
  const planet = flat(load(pic.planet.url));
  sky.add(planet);
  // Twinkling stars (in picture units, -0.5…0.5 across and down).
  const dot = dotTex(T);
  const stars: { s: any; u: number; v: number; size: number; phase: number; speed: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const s = flat(dot, { blending: T.AdditiveBlending, color: [0xffffff, 0xcfe0ff, 0xffe6b0, 0xe6ccff][i % 4] });
    sky.add(s);
    stars.push({ s, u: Math.random() - 0.5, v: Math.random() - 0.5, size: 0.004 + Math.random() * 0.008, phase: Math.random() * 6, speed: 1 + Math.random() * 2.5 });
  }
  // Nebula glows drifting across the top.
  const glowTex = softTex(T, "rgba(255,255,255,0.9)", "rgba(255,255,255,0)");
  const glows = [0xb07cff, 0x5fd0ff, 0xff8fd8].map((color, i) => {
    const s = flat(glowTex, { blending: T.AdditiveBlending, color, opacity: 0.12 });
    sky.add(s);
    return { s, u: -0.25 + i * 0.25, v: -0.36 + (i % 2) * 0.06, phase: i * 2 };
  });
  // Shooting stars.
  const beam = beamTex(T);
  const shooting = flat(beam, { blending: T.AdditiveBlending, color: 0xdfeaff, opacity: 0 });
  sky.add(shooting);
  const shoot = { at: 3, u: 0, v: 0, du: 0, dv: 0 };
  // The ringed planet, floating on the left.
  const ringed = flat(load("/art/space-ringed.webp"));
  ringed.visible = !!opts.ringed;
  sky.add(ringed);
  // The comet (drawn on black, so it's added as light), streaking by now and then.
  const comet = flat(load("/art/space-comet.webp"), { blending: T.AdditiveBlending, opacity: 0 });
  comet.visible = extras;
  sky.add(comet);
  const cometRun = { at: 6 };
  // A burning meteor (drawn heading down-right, on black), flying by now and then — sometimes up
  // the screen, sometimes down — turned so its fiery tail always trails behind.
  const meteor = flat(load("/art/space-meteor.webp"), { blending: T.AdditiveBlending, opacity: 0 });
  meteor.visible = !!opts.meteor;
  sky.add(meteor);
  const meteorRun = { at: 4, u0: 0, v0: 0, u1: 0, v1: 0, dur: 2.6 };
  // Asteroids drifting and tumbling round the board, in the world (so the board passes in front).
  const rockTex = load("/art/space-rock.webp");
  const rocks = (opts.rocks ? [0, 1, 2, 3] : []).map((i) => {
    const r = new T.Sprite(new T.SpriteMaterial({ map: rockTex, transparent: true, depthWrite: false, fog: false }));
    scene.add(r);
    return { r, a0: i * 1.7 + 0.4, dist: 15 + i * 4, y: -5 + i * 3.2, size: 1.2 + (i % 3) * 0.7, spin: (i % 2 ? 1 : -1) * (0.2 + i * 0.07), speed: 0.03 + (3 - i) * 0.01 };
  });
  // Stardust drifting round the board (in the world, so it turns with the board).
  const n = 120, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 16;
    pos.set([Math.cos(a) * r, -6 + Math.random() * 12, Math.sin(a) * r], i * 3);
  }
  const dustGeo = new T.BufferGeometry();
  dustGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
  const dust = new T.Points(dustGeo, new T.PointsMaterial({ size: 0.14, map: dot, color: 0xcfd8ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
  scene.add(dust);

  let clock = 0;
  const dir = new T.Vector3();
  const place = () => {
    // Cover the screen (plus some spare to slide) at distance D.
    const vh = 2 * D * Math.tan((camera.fov * Math.PI) / 360), vw = vh * camera.aspect;
    const ia = IMG_W / IMG_H;
    let pw: number, ph: number;
    if (vw / vh > ia) {
      pw = vw * 1.12;
      ph = pw / ia;
    } else {
      ph = vh * 1.12;
      pw = ph * ia;
    }
    // Slide with the camera: how far round it has turned, and how high it looks from.
    camera.getWorldDirection(dir);
    const yaw = Math.atan2(dir.x, dir.z), pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const spareY = (ph - vh) * 0.45;
    const sx = Math.sin(yaw) * (pw - vw) * 0.45, sy = Math.max(-spareY, Math.min(spareY, (pitch + 0.9) * (ph - vh) * 0.4));
    back.scale.set(pw, ph, 1);
    back.position.set(sx, sy, -D);
    const at = (u: number, v: number, depth: number, z = -D + 1) => [sx * depth + u * pw, sy * depth - v * ph, z] as const;
    const t = clock;
    const [px, py] = at(PLANET.u - 0.5, PLANET.v - 0.5, pic.planet.depth);
    planet.position.set(px, py + Math.sin(t * 0.6) * ph * 0.006, -D + 2);
    planet.scale.set(PLANET.size * pw, PLANET.size * pw, 1);
    planet.material.rotation = Math.sin(t * 0.25) * 0.08;
    for (const st of stars) {
      const [x, y, z] = at(st.u, st.v, 1.2, -D + 3);
      st.s.position.set(x, y, z);
      const tw = 0.35 + 0.65 * Math.max(0, Math.sin(t * st.speed + st.phase));
      st.s.scale.setScalar(st.size * pw * (0.6 + tw * 0.6));
      st.s.material.opacity = tw;
    }
    for (const g of glows) {
      const [x, y, z] = at(g.u + Math.sin(t * 0.05 + g.phase) * 0.05, g.v + Math.cos(t * 0.04 + g.phase) * 0.02, 1.1, -D + 1.5);
      g.s.position.set(x, y, z);
      g.s.scale.set(pw * 0.55, pw * 0.35, 1);
      g.s.material.opacity = 0.08 + 0.06 * Math.sin(t * 0.4 + g.phase);
    }
    const f = (t - shoot.at) / 1.1;
    if (f >= 0 && f <= 1) {
      const [x, y, z] = at(shoot.u + shoot.du * f, shoot.v + shoot.dv * f, 1.2, -D + 4);
      shooting.position.set(x, y, z);
      shooting.scale.set(pw * 0.012, pw * 0.22, 1);
      shooting.material.rotation = Math.atan2(-shoot.dv, shoot.du) - Math.PI / 2;
      shooting.material.opacity = Math.sin(Math.PI * f) * 0.9;
    } else {
      shooting.material.opacity = 0;
      if (f > 1) {
        shoot.at = t + 4 + Math.random() * 6;
        shoot.u = -0.3 + Math.random() * 0.6;
        shoot.v = -0.45 + Math.random() * 0.2;
        shoot.du = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.15);
        shoot.dv = 0.15 + Math.random() * 0.1;
      }
    }
    const [rx, ry] = at(-0.34, -0.14, 1.5);
    ringed.position.set(rx, ry + Math.sin(t * 0.5) * ph * 0.008, -D + 2.5);
    ringed.scale.set(pw * 0.3, pw * 0.3 * (353 / 512), 1);
    ringed.material.rotation = -0.08 + Math.sin(t * 0.3) * 0.05;
    // The comet: from the top right down to the left, every 14–24 seconds.
    const cf = (t - cometRun.at) / 3.2;
    if (cf >= 0 && cf <= 1) {
      const [cx, cy] = at(0.6 - cf * 1.2, -0.42 + cf * 0.5, 1.25);
      comet.position.set(cx, cy, -D + 3.5);
      comet.scale.set(pw * 0.32, pw * 0.32, 1);
      comet.material.opacity = Math.min(1, Math.sin(Math.PI * cf) * 1.6);
    } else {
      comet.material.opacity = 0;
      if (cf > 1) cometRun.at = t + 14 + Math.random() * 10;
    }
    if (opts.meteor) {
      const mf = (t - meteorRun.at) / meteorRun.dur;
      if (mf >= 0 && mf <= 1) {
        const [mx, my] = at(meteorRun.u0 + (meteorRun.u1 - meteorRun.u0) * mf, meteorRun.v0 + (meteorRun.v1 - meteorRun.v0) * mf, 1.3);
        meteor.position.set(mx, my, -D + 4);
        meteor.scale.set(pw * 0.26, pw * 0.26, 1);
        // The picture flies toward the bottom right (-45°); turn it to the way it's going.
        const heading = Math.atan2(-(meteorRun.v1 - meteorRun.v0) * ph, (meteorRun.u1 - meteorRun.u0) * pw);
        meteor.material.rotation = heading + Math.PI / 4;
        meteor.material.opacity = Math.min(1, Math.sin(Math.PI * mf) * 1.8);
      } else {
        meteor.material.opacity = 0;
        if (mf > 1) {
          const up = Math.random() < 0.5, right = Math.random() < 0.5;
          meteorRun.at = t + 7 + Math.random() * 9;
          meteorRun.u0 = (right ? -0.65 : 0.65) + (Math.random() - 0.5) * 0.3;
          meteorRun.u1 = (right ? 0.65 : -0.65) + (Math.random() - 0.5) * 0.3;
          meteorRun.v0 = up ? 0.3 + Math.random() * 0.3 : -0.55 + Math.random() * 0.2;
          meteorRun.v1 = up ? -0.55 + Math.random() * 0.2 : 0.3 + Math.random() * 0.3;
          meteorRun.dur = 2.2 + Math.random() * 1.2;
        }
      }
    }
    for (const k of rocks) {
      const a = k.a0 + t * k.speed;
      k.r.position.set(Math.cos(a) * k.dist, k.y + Math.sin(t * 0.4 + k.a0) * 0.6, Math.sin(a) * k.dist);
      k.r.scale.set(k.size, k.size, 1);
      k.r.material.rotation = t * k.spin;
    }
    dust.rotation.y = t * 0.02;
    dust.material.opacity = 0.6 + Math.sin(t * 1.5) * 0.2;
  };
  place();
  return {
    update(_now, dt) {
      if (!still) clock += dt;
      place();
    },
  };
}

/**
 * A seaside page's backdrop: the theme's painted sea picture stays behind the island like a phone
 * wallpaper (sliding a touch as you turn, as in createSpace), and on it the water glints, a small
 * sailboat crosses the bay, gulls fly over and soft clouds drift along the top.
 */
export function createSea(
  T: any,
  scene: any,
  camera: any,
  opts: { url: string; w: number; h: number; reduceMotion?: boolean; far?: number; boat?: { url: string; aspect: number }; gull?: { url: string; aspect: number } },
): Backdrop {
  const still = !!opts.reduceMotion;
  const D = opts.far ?? 200;
  const tex = new T.TextureLoader().load(opts.url);
  tex.encoding = T.sRGBEncoding;
  scene.background = new T.Color(0x1f8fe0).convertSRGBToLinear();
  scene.fog = new T.Fog(new T.Color(0x9fd6f5).convertSRGBToLinear(), 45, 160);
  if (!camera.parent) scene.add(camera);
  const sky = new T.Group();
  camera.add(sky);
  const back = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex, depthWrite: false, fog: false, toneMapped: false }));
  back.position.z = -D;
  back.renderOrder = -100;
  sky.add(back);
  const flat = (map: any, extra: Record<string, unknown> = {}) =>
    new T.Sprite(new T.SpriteMaterial(Object.assign({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false }, extra)));
  // Glints on the open water (picture units: -0.5…0.5 across and down).
  const dot = dotTex(T);
  const glints = Array.from({ length: 34 }, () => {
    const s = flat(dot, { blending: T.AdditiveBlending });
    sky.add(s);
    return { s, u: -0.45 + Math.random() * 0.9, v: -0.18 + Math.random() * 0.46, size: 0.006 + Math.random() * 0.007, phase: Math.random() * 6, speed: 1 + Math.random() * 2 };
  });
  const pic = (url: string) => {
    const t = new T.TextureLoader().load(url);
    t.encoding = T.sRGBEncoding;
    return t;
  };
  const boat = flat(opts.boat ? pic(opts.boat.url) : boatTex(T));
  const boatAspect = opts.boat?.aspect ?? 1;
  sky.add(boat);
  const up = birdTex(T, true), down = birdTex(T, false);
  const gullPic = opts.gull ? pic(opts.gull.url) : null;
  const gullAspect = opts.gull?.aspect ?? 2;
  const gulls = [0, 1, 2].map((i) => {
    const s = flat(gullPic ?? up, { color: 0xffffff });
    sky.add(s);
    return { s, u: -0.7 - i * 0.12, v: -0.33 + i * 0.03, speed: 0.045 + i * 0.008, phase: i * 1.3 };
  });
  const cloud = cloudTex(T);
  const clouds = [0, 1].map((i) => {
    const s = flat(cloud, { opacity: 0.55 });
    sky.add(s);
    return { s, u: -0.3 + i * 0.7, v: -0.42 + i * 0.05, speed: 0.006 + i * 0.003 };
  });
  let clock = 0;
  const dir = new T.Vector3();
  const place = () => {
    const vh = 2 * D * Math.tan((camera.fov * Math.PI) / 360), vw = vh * camera.aspect;
    const ia = opts.w / opts.h;
    let pw: number, ph: number;
    if (vw / vh > ia) {
      pw = vw * 1.12;
      ph = pw / ia;
    } else {
      ph = vh * 1.12;
      pw = ph * ia;
    }
    camera.getWorldDirection(dir);
    const yaw = Math.atan2(dir.x, dir.z), pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    const spareY = (ph - vh) * 0.45;
    const sx = Math.sin(yaw) * (pw - vw) * 0.45, sy = Math.max(-spareY, Math.min(spareY, (pitch + 0.9) * (ph - vh) * 0.4));
    back.scale.set(pw, ph, 1);
    back.position.set(sx, sy, -D);
    const at = (u: number, v: number, depth: number) => [sx * depth + u * pw, sy * depth - v * ph] as const;
    const t = clock;
    for (const g of glints) {
      const [x, y] = at(g.u, g.v, 1.05);
      g.s.position.set(x, y, -D + 2);
      const tw = Math.max(0, Math.sin(t * g.speed + g.phase));
      g.s.scale.setScalar(g.size * pw * (0.4 + tw * 0.8));
      g.s.material.opacity = tw * 0.85;
    }
    // The boat sails the open water above the island, over and back (turning round at each end),
    // rocking on the swell.
    const leg = (t * 0.012) % 2, going = leg < 1, k = going ? leg : 2 - leg;
    const ease = k * k * (3 - 2 * k);
    const [bx, by] = at(-0.6 + ease * 0.75, -0.19 + Math.sin(t * 1.4) * 0.002, 1.1);
    boat.position.set(bx, by, -D + 3);
    boat.scale.set(pw * 0.075 * (going ? 1 : -1), (pw * 0.075) / boatAspect, 1);
    boat.material.rotation = Math.sin(t * 1.4) * 0.06;
    for (const g of gulls) {
      const u = ((((g.u + t * g.speed) % 1.6) + 1.6) % 1.6) - 0.8;
      const [x, y] = at(u, g.v + Math.sin(t * 0.8 + g.phase) * 0.008, 1.3);
      g.s.position.set(x, y, -D + 4);
      if (gullPic) {
        // One picture: the wings beat by squashing it up and down.
        const beat = 0.7 + 0.3 * Math.abs(Math.sin(t * 5 + g.phase * 3));
        g.s.scale.set(pw * 0.06, ((pw * 0.06) / gullAspect) * beat, 1);
      } else {
        g.s.scale.set(pw * 0.045, pw * 0.0225, 1);
        g.s.material.map = Math.sin(t * 9 + g.phase * 3) > 0 ? up : down;
      }
    }
    for (const c of clouds) {
      const u = ((((c.u + t * c.speed) % 1.8) + 1.8) % 1.8) - 0.9;
      const [x, y] = at(u, c.v, 1.2);
      c.s.position.set(x, y, -D + 1.5);
      c.s.scale.set(pw * 0.42, pw * 0.21, 1);
    }
  };
  place();
  return {
    update(_now, dt) {
      if (!still) clock += dt;
      place();
    },
  };
}
