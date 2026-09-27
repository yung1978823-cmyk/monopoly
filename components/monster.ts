/**
 * The monsters, built in code (no model files yet): a round, big-eyed body in the element's colours
 * with the element's own features — 金 an armoured pangolin with a horn, 木 a fawn with leafy
 * antlers, 水 a little sea dragon with fins and a long tail, 火 a fox with a flame tail, 土 a turtle
 * with a rock shell. Stage 0 is an egg; each stage after grows it and its features, and 王者 wears a
 * crown with a glowing ring. Legendary (NFT) monsters are the element's divine beast in their own
 * colours (白虎, 青龍, 玄武, 朱雀, 麒麟) with a gold band.
 */
export type Monster = {
  group: any;
  /** Call every frame with performance.now(). */
  update(now: number): void;
  /** Roughly how tall it stands, for placing things above it. */
  height: number;
};

const PALETTE = [
  // body, belly, feature, accent
  { body: 0xd8b13a, belly: 0xfff3cf, feature: 0xc9ced6, accent: 0xffd34d },
  { body: 0x7cc86a, belly: 0xf0fbd9, feature: 0x8b5a2b, accent: 0x4fae45 },
  { body: 0x4a9bf0, belly: 0xdcf0ff, feature: 0x7fe0ff, accent: 0x2fd0c8 },
  { body: 0xf58a3c, belly: 0xfff0dc, feature: 0xffc53d, accent: 0xff5a1f },
  { body: 0x9ccf6b, belly: 0xf4f1d0, feature: 0x9a7552, accent: 0xc2a27a },
];
const LEGEND = [
  { body: 0xf7f7f2, belly: 0xffffff, feature: 0x2b2b2b, accent: 0xffd34d },
  { body: 0x22a67a, belly: 0xcff5e3, feature: 0xffd34d, accent: 0x7cf0c3 },
  { body: 0x2e5577, belly: 0x9cc3de, feature: 0x3b6b57, accent: 0x9ff3ff },
  { body: 0xe03131, belly: 0xffe0b8, feature: 0xffb020, accent: 0xffe066 },
  { body: 0xe6b73e, belly: 0xfff3cc, feature: 0x3f8f6a, accent: 0xff9b3d },
];
/** Overall size, and how big each element's features grow, per stage. */
const SIZE = [0.7, 0.62, 0.8, 0.98, 1.15];
const GROW = [0, 0.6, 0.85, 1.1, 1.35];
const HEAD = [0, 0.5, 0.46, 0.42, 0.4];

export function buildMonster(T: any, element: number, stage: number, legend = false): Monster {
  stage = Math.max(0, Math.min(4, stage));
  const pal = (legend ? LEGEND : PALETTE)[element] ?? PALETTE[0];
  const lin = (hex: number) => new T.Color(hex).convertSRGBToLinear();
  const mat = (hex: number, rough = 0.5, extra: Record<string, unknown> = {}) => {
    const m = new T.MeshStandardMaterial(Object.assign({ roughness: rough }, extra));
    m.color = lin(hex);
    if (typeof extra.emissive === "number") m.emissive = lin(extra.emissive as number);
    return m;
  };
  const mesh = (geo: any, material: any) => {
    const m = new T.Mesh(geo, material);
    m.castShadow = true;
    return m;
  };
  const ball = (r: number, material: any, detail = 1) => mesh(new T.SphereGeometry(r, Math.round(28 * detail), Math.round(20 * detail)), material);
  const root = new T.Group();
  const body = new T.Group();
  root.add(body);
  const s = SIZE[stage];
  body.scale.setScalar(s);

  // ---------- Egg ----------
  if (stage === 0) {
    const egg = ball(0.42, mat(0xfff6e0, 0.45));
    egg.scale.set(1, 1.3, 1);
    egg.position.y = 0.55;
    body.add(egg);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + k, y = 0.3 + (k % 3) * 0.22;
      const spot = ball(0.1 - (k % 2) * 0.03, mat(pal.body, 0.5), 0.5);
      const r = 0.42 * Math.sqrt(Math.max(0.1, 1 - ((y - 0.55) / 0.55) ** 2));
      spot.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      spot.scale.set(1, 1, 0.3);
      spot.lookAt(0, y, 0);
      body.add(spot);
    }
    return {
      group: root,
      height: 1.1 * s,
      update(now) {
        // A little wobble now and then, as if something inside wants out.
        const k = now / 1000;
        const kick = Math.max(0, Math.sin(k * 1.7)) ** 12;
        body.rotation.z = Math.sin(k * 14) * 0.12 * kick;
        body.position.y = Math.abs(Math.sin(k * 14)) * 0.04 * kick;
      },
    };
  }

  const g = GROW[stage];
  const headR = HEAD[stage];
  const bodyMat = mat(pal.body);
  const bellyMat = mat(pal.belly, 0.7);
  const featureMat = mat(pal.feature, 0.45);
  const accentMat = mat(pal.accent, 0.45);
  const e = element;
  const isTurtle = e === 4 && !legend;

  // ---------- Body ----------
  const torso = ball(0.5, bodyMat);
  torso.scale.set(1, stage >= 3 ? 0.98 : 0.9, 1);
  torso.position.y = 0.48;
  body.add(torso);
  const belly = ball(0.5, bellyMat);
  belly.scale.set(0.7, 0.72, 0.36);
  belly.position.set(0, 0.44, 0.33);
  body.add(belly);
  for (const [x, z] of [[-0.24, 0.2], [0.24, 0.2], [-0.24, -0.2], [0.24, -0.2]]) {
    const foot = ball(0.14, bodyMat, 0.5);
    foot.scale.set(1, 0.6, 1.25);
    foot.position.set(x, 0.07, z);
    body.add(foot);
  }
  if (stage >= 2) {
    for (const x of [-1, 1]) {
      const arm = ball(0.12, bodyMat, 0.5);
      arm.scale.set(0.8, 1.2, 0.8);
      arm.position.set(x * 0.44, 0.45, 0.16);
      arm.rotation.z = x * 0.5;
      body.add(arm);
    }
  }

  // ---------- Head ----------
  const head = new T.Group();
  head.position.set(0, 0.88 + headR * 0.55, 0.06);
  body.add(head);
  head.add(ball(headR, bodyMat));
  const snouty = e === 0 || e === 1 || e === 3 || (legend && e !== 2);
  if (snouty) {
    const snout = ball(headR * 0.36, bellyMat, 0.6);
    snout.scale.set(1.15, 0.8, 1);
    snout.position.set(0, -headR * 0.3, headR * 0.82);
    head.add(snout);
    const nose = ball(headR * 0.09, mat(0x2a1a1a, 0.3), 0.4);
    nose.position.set(0, -headR * 0.22, headR * 1.15);
    head.add(nose);
  }
  const eyes: any[] = [];
  for (const x of [-1, 1]) {
    const eye = new T.Group();
    eye.position.set(x * headR * 0.4, headR * 0.12, headR * 0.76);
    eye.rotation.y = x * 0.25;
    head.add(eye);
    const white = ball(headR * 0.3, mat(0xffffff, 0.25), 0.6);
    white.scale.z = 0.7;
    eye.add(white);
    const pupil = ball(headR * 0.21, mat(0x1b1b28, 0.15), 0.6);
    pupil.scale.z = 0.6;
    pupil.position.z = headR * 0.1;
    eye.add(pupil);
    for (const [dx, dy, r] of [[0.07, 0.08, 0.075], [-0.06, -0.06, 0.035]]) {
      const shine = new T.Mesh(new T.SphereGeometry(headR * r, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(headR * dx, headR * dy, headR * 0.23);
      eye.add(shine);
    }
    eyes.push(eye);
    const cheek = new T.Mesh(new T.CircleGeometry(headR * 0.13, 20), new T.MeshBasicMaterial({ color: 0xff7f96, transparent: true, opacity: 0.55, depthWrite: false }));
    const cx = x * headR * 0.62, cy = -headR * 0.22;
    cheek.position.set(cx, cy, Math.sqrt(Math.max(0, headR * headR - cx * cx - cy * cy)) + 0.005);
    cheek.lookAt(cx * 3, cy * 3, headR * 3);
    head.add(cheek);
  }
  const mouth = new T.Mesh(new T.TorusGeometry(headR * 0.1, headR * 0.022, 6, 14, Math.PI), mat(0x5a2a2a, 0.5));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, snouty ? -headR * 0.5 : -headR * 0.3, snouty ? headR * 0.9 : headR * 0.95);
  head.add(mouth);

  // ---------- Element features ----------
  let tail: any = null;
  const flicker: any[] = [];
  if (e === 0) {
    if (!legend) {
      // Armour bands arching over the back, more and thicker each stage.
      const plate = mat(pal.feature, 0.25, { metalness: 0.75 });
      const trim = mat(pal.accent, 0.3, { metalness: 0.6 });
      for (let k = 0; k < 2 + stage; k++) {
        const band = mesh(new T.TorusGeometry(0.47 - k * 0.025, 0.05 * g + 0.02, 8, 24, Math.PI), k % 2 ? trim : plate);
        band.position.set(0, 0.5, -0.04 - k * 0.1);
        band.rotation.y = 0;
        band.scale.set(1, 0.95, 1);
        body.add(band);
      }
    } else {
      // 白虎: round ears and black stripes.
      for (let k = 0; k < 3; k++) {
        const stripe = mesh(new T.TorusGeometry(0.5, 0.03, 6, 20, Math.PI * 0.5), mat(0x222222));
        stripe.position.set(0, 0.48, -0.08 - k * 0.12);
        stripe.rotation.z = Math.PI * 0.25;
        body.add(stripe);
      }
    }
    for (const x of [-1, 1]) {
      const ear = ball(headR * 0.26, bodyMat, 0.5);
      ear.scale.set(1, 1, 0.5);
      ear.position.set(x * headR * 0.72, headR * 0.72, -headR * 0.1);
      head.add(ear);
    }
    const horn = mesh(new T.ConeGeometry(0.06 * g + 0.03, 0.28 * g + 0.08, 12), accentMat);
    horn.position.set(0, headR * 0.98, headR * 0.3);
    horn.rotation.x = 0.3;
    head.add(horn);
    tail = new T.Group();
    tail.position.set(0, 0.35, -0.48);
    body.add(tail);
    const stalk = mesh(new T.CylinderGeometry(0.05, 0.08, 0.35, 8), bodyMat);
    stalk.rotation.x = -1;
    stalk.position.z = -0.12;
    tail.add(stalk);
    if (stage >= 3) {
      const mace = mesh(new T.IcosahedronGeometry(0.12, 0), mat(pal.feature, 0.25, { metalness: 0.7, flatShading: true }));
      mace.position.set(0, 0.12, -0.28);
      tail.add(mace);
    }
  } else if (e === 1) {
    // Antlers that branch more each stage, with leaves (青龍: gold horns and whiskers instead).
    for (const x of [-1, 1]) {
      const antler = new T.Group();
      antler.position.set(x * headR * 0.42, headR * 0.82, -headR * 0.05);
      antler.rotation.z = -x * 0.35;
      head.add(antler);
      const len = 0.16 + 0.13 * stage;
      const stem = mesh(new T.CylinderGeometry(0.022, 0.04, len, 6), legend ? accentMat : featureMat);
      stem.position.y = len / 2;
      antler.add(stem);
      for (let k = 1; k <= stage; k++) {
        const branch = mesh(new T.CylinderGeometry(0.016, 0.026, len * 0.45, 6), legend ? accentMat : featureMat);
        branch.position.set(x * 0.05, len * (0.3 + k * 0.16), 0);
        branch.rotation.z = -x * 0.85;
        antler.add(branch);
        if (!legend) {
          const leaf = ball(0.065, accentMat, 0.4);
          leaf.scale.set(1, 0.45, 1.5);
          leaf.position.set(x * 0.15, len * (0.42 + k * 0.16), 0);
          antler.add(leaf);
        }
      }
      if (!legend && stage >= 2) {
        const flower = ball(0.06, mat(0xff8fb8, 0.5), 0.4);
        flower.position.set(0, len, 0);
        antler.add(flower);
      }
      const ear = mesh(new T.ConeGeometry(headR * 0.18, headR * 0.5, 8), bodyMat);
      ear.position.set(x * headR * 0.85, headR * 0.35, -headR * 0.1);
      ear.rotation.z = -x * 1.1;
      head.add(ear);
    }
    if (legend) {
      for (const x of [-1, 1]) {
        const whisker = new T.Mesh(new T.TorusGeometry(0.22, 0.012, 6, 16, Math.PI * 0.6), accentMat);
        whisker.position.set(x * headR * 0.55, -headR * 0.25, headR * 0.8);
        whisker.rotation.set(0, x * 0.6, x > 0 ? Math.PI : 0);
        head.add(whisker);
      }
    }
    // White spots down the back, like a fawn.
    for (let k = 0; k < 5; k++) {
      const spot = ball(0.05, bellyMat, 0.3);
      spot.scale.set(1, 0.4, 1);
      spot.position.set(((k % 2) - 0.5) * 0.3, 0.86 - k * 0.04, -0.1 - k * 0.07);
      body.add(spot);
    }
    tail = new T.Group();
    tail.position.set(0, 0.55, -0.5);
    body.add(tail);
    const puff = ball(0.13, bellyMat, 0.5);
    tail.add(puff);
  } else if (e === 2) {
    if (legend) {
      // 玄武: a dark shell and a snake for a tail.
      const shell = mesh(new T.SphereGeometry(0.58, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(pal.feature, 0.6, { flatShading: true }));
      shell.scale.set(1.02, 0.75, 1.05);
      shell.position.set(0, 0.45, -0.05);
      body.add(shell);
    } else {
      // Fins down the back.
      for (let k = 0; k < 1 + stage; k++) {
        const fin = mesh(new T.ConeGeometry(0.08 * g + 0.04, 0.22 * g + 0.08, 3), mat(pal.feature, 0.4));
        fin.scale.set(0.3, 1, 1);
        fin.position.set(0, 0.95 - k * 0.1, -0.05 - k * 0.13);
        fin.rotation.x = -0.5 - k * 0.2;
        body.add(fin);
      }
    }
    // Fin-ears and little horns.
    for (const x of [-1, 1]) {
      const finEar = mesh(new T.ConeGeometry(headR * 0.28, headR * (0.7 + 0.1 * stage), 3), mat(pal.feature, 0.4));
      finEar.scale.set(1, 1, 0.25);
      finEar.position.set(x * headR * 0.9, headR * 0.15, -headR * 0.15);
      finEar.rotation.set(0, x * 0.4, -x * 1.3);
      head.add(finEar);
      const horn = mesh(new T.ConeGeometry(0.045, 0.12 + 0.05 * stage, 8), accentMat);
      horn.position.set(x * headR * 0.35, headR * 0.92, -headR * 0.05);
      horn.rotation.z = -x * 0.25;
      head.add(horn);
    }
    // A long tail curling behind, with a fin at the end.
    tail = new T.Group();
    tail.position.set(0, 0.32, -0.42);
    body.add(tail);
    let z = 0, y = 0;
    for (let k = 0; k < 3 + Math.min(2, stage); k++) {
      const r = 0.12 - k * 0.018;
      const seg = ball(Math.max(0.04, r), legend ? mat(0x3b6b57) : bodyMat, 0.5);
      z -= r * 1.4;
      y += 0.03;
      seg.position.set(0, y, z);
      tail.add(seg);
    }
    const tfin = mesh(new T.ConeGeometry(0.1 * g + 0.06, 0.25, 3), mat(pal.feature, 0.4));
    tfin.scale.set(1, 1, 0.25);
    tfin.position.set(0, y + 0.05, z - 0.12);
    tfin.rotation.x = -Math.PI / 2;
    tail.add(tfin);
  } else if (e === 3) {
    // Fox ears with pale insides, a flame tail that burns bigger each stage; 朱雀 and 王者 get wings.
    for (const x of [-1, 1]) {
      const ear = mesh(new T.ConeGeometry(headR * 0.3, headR * 0.75, 12), bodyMat);
      ear.position.set(x * headR * 0.55, headR * 0.88, -headR * 0.05);
      ear.rotation.z = -x * 0.28;
      head.add(ear);
      const inner = mesh(new T.ConeGeometry(headR * 0.18, headR * 0.5, 12), bellyMat);
      inner.position.set(x * headR * 0.56, headR * 0.84, headR * 0.06);
      inner.rotation.z = -x * 0.28;
      head.add(inner);
      if (legend || stage >= 4) {
        const wing = mesh(new T.ConeGeometry(0.22 * g + 0.05, 0.75 * g, 3), mat(legend ? pal.accent : pal.feature, 0.45, { emissive: pal.accent, emissiveIntensity: 0.25 }));
        wing.scale.set(1, 1, 0.2);
        wing.position.set(x * 0.52, 0.72, -0.12);
        wing.rotation.z = -x * 1.15;
        body.add(wing);
        flicker.push(wing);
      }
    }
    if (legend || stage >= 3) {
      const crest = mesh(new T.ConeGeometry(0.06, 0.22 + 0.05 * stage, 8), mat(pal.accent, 0.4, { emissive: pal.accent, emissiveIntensity: 0.7 }));
      crest.position.set(0, headR * 1.02, 0);
      head.add(crest);
      flicker.push(crest);
    }
    tail = new T.Group();
    tail.position.set(0, 0.35, -0.42);
    tail.rotation.x = -1.05;
    body.add(tail);
    const fur = ball(0.17 * g + 0.08, bodyMat, 0.5);
    fur.scale.set(1, 1.4, 1);
    fur.position.y = 0.12;
    tail.add(fur);
    for (let k = 0; k < 3; k++) {
      const f = new T.Mesh(
        new T.ConeGeometry(0.15 * g + 0.05 - k * 0.04, 0.38 * g + 0.15 - k * 0.08, 12),
        mat(k === 0 ? pal.accent : k === 1 ? pal.feature : 0xfff3b0, 0.4, { emissive: k === 0 ? pal.accent : pal.feature, emissiveIntensity: 0.7 }),
      );
      f.position.set(0, 0.28 + 0.22 * g + k * 0.04, 0);
      tail.add(f);
      flicker.push(f);
    }
  } else if (legend) {
    // 麒麟: one gold horn, a green mane and scales.
    const horn = mesh(new T.ConeGeometry(0.06, 0.42, 12), mat(0xffd34d, 0.3, { metalness: 0.6 }));
    horn.position.set(0, headR * 1.05, headR * 0.1);
    head.add(horn);
    for (let k = 0; k < 7; k++) {
      const tuft = ball(0.1, featureMat, 0.4);
      tuft.position.set((k - 3) * 0.08, headR * 0.55 - Math.abs(k - 3) * 0.05, -headR * 0.65);
      head.add(tuft);
    }
    tail = new T.Group();
    tail.position.set(0, 0.4, -0.5);
    body.add(tail);
    tail.add(ball(0.13, featureMat, 0.5));
  } else {
    // 土: a turtle with a rock shell of hex plates; crags grow on it from 成年.
    const shellMat = mat(pal.feature, 0.85, { flatShading: true });
    const shell = mesh(new T.SphereGeometry(0.56, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
    shell.scale.set(1.0, 0.7 + 0.04 * stage, 1.0);
    shell.position.set(0, 0.46, -0.14);
    shell.rotation.x = -0.3;
    body.add(shell);
    const plateMat = mat(pal.accent, 0.85, { flatShading: true });
    const spots: [number, number][] = [[0, 0], [0.3, 0.9], [0.3, 2.95], [0.3, 5], [0.55, 0.3], [0.55, 2.4], [0.55, 4.4]];
    for (const [tilt, turn] of spots) {
      const plate = mesh(new T.CylinderGeometry(0.1, 0.1, 0.04, 6), plateMat);
      const holder = new T.Group();
      holder.position.set(0, 0.46, -0.14);
      holder.rotation.set(-0.3, turn, 0);
      body.add(holder);
      const arm = new T.Group();
      arm.rotation.x = tilt;
      holder.add(arm);
      plate.position.y = 0.56 * (0.7 + 0.04 * stage) - 0.02;
      arm.add(plate);
    }
    for (let k = 0; k < Math.max(0, stage - 2) * 2; k++) {
      const crag = mesh(new T.ConeGeometry(0.07, 0.2, 5), mat(0x8a8f98, 0.9, { flatShading: true }));
      crag.position.set(Math.cos(k * 2.3) * 0.2, 0.86, -0.1 + Math.sin(k * 2.3) * 0.22);
      body.add(crag);
    }
    tail = mesh(new T.ConeGeometry(0.07, 0.22, 8), bodyMat);
    tail.position.set(0, 0.2, -0.56);
    tail.rotation.x = -1.8;
    body.add(tail);
  }
  if (isTurtle) head.position.set(0, head.position.y + 0.08, head.position.z + 0.22);

  // Gold band for legendary monsters; a crown and a glowing ring for 王者.
  if (legend) {
    const band = mesh(new T.TorusGeometry(0.48, 0.03, 8, 32), mat(0xffd34d, 0.3, { metalness: 0.7 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.5;
    body.add(band);
  }
  let aura: any = null;
  if (stage >= 4) {
    const crown = new T.Group();
    crown.position.set(0, headR * 0.95, -headR * 0.1);
    crown.rotation.x = -0.15;
    head.add(crown);
    const gold = mat(0xffd34d, 0.3, { metalness: 0.7, emissive: 0x7a5a00, emissiveIntensity: 0.3 });
    crown.add(mesh(new T.CylinderGeometry(headR * 0.5, headR * 0.55, headR * 0.3, 20), gold));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
      const spike = mesh(new T.ConeGeometry(headR * 0.13, headR * 0.4, 8), gold);
      spike.position.set(Math.cos(a) * headR * 0.42, headR * 0.34, Math.sin(a) * headR * 0.42);
      crown.add(spike);
      const gem = ball(headR * 0.08, mat(k % 2 ? 0x2f80ed : 0xe52521, 0.2), 0.4);
      gem.position.set(Math.cos(a) * headR * 0.53, 0, Math.sin(a) * headR * 0.53);
      crown.add(gem);
    }
    aura = new T.Mesh(new T.RingGeometry(0.75, 0.9, 48), new T.MeshBasicMaterial({ color: pal.accent, transparent: true, opacity: 0.5, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.03;
    root.add(aura);
  }

  let nextBlink = 0;
  return {
    group: root,
    height: (0.88 + headR * 1.6) * s,
    update(now) {
      const k = now / 1000;
      body.position.y = Math.abs(Math.sin(k * 2.2)) * 0.05;
      body.scale.set(s * (1 + Math.sin(k * 4.4) * 0.015), s * (1 - Math.sin(k * 4.4) * 0.015), s);
      head.rotation.z = Math.sin(k * 1.3) * 0.08;
      head.rotation.x = Math.sin(k * 0.9) * 0.04;
      if (tail) tail.rotation.y = Math.sin(k * 4) * 0.35;
      for (const f of flicker) f.scale.y = 0.92 + Math.random() * 0.18;
      if (now > nextBlink) nextBlink = now + 2500 + Math.random() * 2500;
      const blink = nextBlink - now < 120 ? 0.1 : 1;
      for (const eye of eyes) eye.scale.y = blink;
      if (aura) {
        aura.rotation.z = k * 0.8;
        aura.material.opacity = 0.35 + Math.sin(k * 3) * 0.15;
      }
    },
  };
}
