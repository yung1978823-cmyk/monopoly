/**
 * The monsters, built in code (no model files yet): a round, big-eyed body in the element's colours
 * with the element's own features — 金 armour plates and a horn, 木 antlers with leaves, 水 fins,
 * 火 fox ears and a flame tail, 土 a rock shell. Stage 0 is an egg; each stage after grows it and its
 * features, and 王者 wears a crown with a glowing ring. Legendary (NFT) monsters are the element's
 * divine beast in their own colours (白虎, 青龍, 玄武, 朱雀, 麒麟) with a gold trim.
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
  { body: 0xc9a227, belly: 0xfff1c1, feature: 0xd9dde3, accent: 0xffd34d },
  { body: 0x66bb55, belly: 0xe7f7c8, feature: 0x8b5a2b, accent: 0x9be15d },
  { body: 0x3a8ee6, belly: 0xd4ecff, feature: 0x7fd3ff, accent: 0x2fd0c8 },
  { body: 0xf07a2e, belly: 0xffe3c2, feature: 0xffb020, accent: 0xff4d1a },
  { body: 0xb98552, belly: 0xf2dcbc, feature: 0x7b7f86, accent: 0x9c6b3a },
];
const LEGEND = [
  { body: 0xf5f5f0, belly: 0xffffff, feature: 0x2b2b2b, accent: 0xffd34d },
  { body: 0x1f9e74, belly: 0xc9f2df, feature: 0xffd34d, accent: 0x7cf0c3 },
  { body: 0x24425f, belly: 0x7aa7c7, feature: 0x3b6b57, accent: 0x9ff3ff },
  { body: 0xd62828, belly: 0xffd3a8, feature: 0xffb020, accent: 0xffe066 },
  { body: 0xe0b23c, belly: 0xfff0c2, feature: 0x3f8f6a, accent: 0xff9b3d },
];
const SIZE = [0.7, 0.62, 0.8, 0.98, 1.15];

export function buildMonster(T: any, element: number, stage: number, legend = false): Monster {
  const pal = (legend ? LEGEND : PALETTE)[element] ?? PALETTE[0];
  const lin = (hex: number) => new T.Color(hex).convertSRGBToLinear();
  const mat = (hex: number, rough = 0.55, extra: Record<string, unknown> = {}) => {
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
  const root = new T.Group();
  const body = new T.Group();
  root.add(body);
  const s = SIZE[Math.max(0, Math.min(4, stage))];
  body.scale.setScalar(s);

  // ---------- Egg ----------
  if (stage <= 0) {
    const egg = mesh(new T.SphereGeometry(0.42, 24, 18), mat(0xfff6e0, 0.5));
    egg.scale.set(1, 1.3, 1);
    egg.position.y = 0.55;
    body.add(egg);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, y = 0.35 + (k % 3) * 0.2;
      const spot = mesh(new T.SphereGeometry(0.09 - (k % 2) * 0.03, 10, 8), mat(pal.body, 0.5));
      const r = 0.42 * Math.sqrt(Math.max(0.1, 1 - ((y - 0.55) / 0.55) ** 2));
      spot.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      spot.scale.set(1, 1, 0.35);
      spot.lookAt(0, y, 0);
      body.add(spot);
    }
    return {
      group: root,
      height: 1.1 * s,
      update(now) {
        // A little wobble, as if something inside wants out.
        const k = now / 1000;
        const kick = Math.max(0, Math.sin(k * 1.7)) ** 12;
        body.rotation.z = Math.sin(k * 14) * 0.12 * kick;
        body.position.y = Math.abs(Math.sin(k * 14)) * 0.04 * kick;
      },
    };
  }

  // ---------- The creature ----------
  const bodyMat = mat(pal.body);
  const torso = mesh(new T.SphereGeometry(0.5, 24, 18), bodyMat);
  torso.scale.set(1, 0.88, 1.05);
  torso.position.y = 0.5;
  body.add(torso);
  const belly = mesh(new T.SphereGeometry(0.36, 20, 14), mat(pal.belly, 0.7));
  belly.scale.set(1, 1, 0.5);
  belly.position.set(0, 0.45, 0.33);
  body.add(belly);
  // Chibi head: big when small, a little smaller as it grows.
  const headR = [0, 0.46, 0.42, 0.38, 0.36][stage];
  const head = new T.Group();
  head.position.set(0, 0.95 + headR * 0.55, 0.08);
  body.add(head);
  head.add(mesh(new T.SphereGeometry(headR, 24, 18), bodyMat));
  const face = mesh(new T.SphereGeometry(headR * 0.7, 18, 12), mat(pal.belly, 0.7));
  face.scale.set(1, 0.75, 0.55);
  face.position.set(0, -headR * 0.18, headR * 0.62);
  head.add(face);
  // Eyes (they blink).
  const eyes: any[] = [];
  for (const x of [-1, 1]) {
    const eye = new T.Group();
    eye.position.set(x * headR * 0.38, headR * 0.12, headR * 0.83);
    head.add(eye);
    eye.add(mesh(new T.SphereGeometry(headR * 0.26, 16, 12), mat(0xffffff, 0.3)));
    const pupil = mesh(new T.SphereGeometry(headR * 0.17, 14, 10), mat(0x1b1b28, 0.2));
    pupil.position.z = headR * 0.12;
    eye.add(pupil);
    const shine = new T.Mesh(new T.SphereGeometry(headR * 0.06, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(headR * 0.06, headR * 0.07, headR * 0.26);
    eye.add(shine);
    eyes.push(eye);
    if (stage <= 2) {
      const cheek = new T.Mesh(new T.CircleGeometry(headR * 0.12, 16), new T.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.7 }));
      cheek.position.set(x * headR * 0.55, -headR * 0.2, headR * 0.86);
      cheek.lookAt(x * headR * 2, -headR * 0.2, headR * 3);
      head.add(cheek);
    }
  }
  const mouth = new T.Mesh(new T.TorusGeometry(headR * 0.1, headR * 0.025, 6, 12, Math.PI), mat(0x3b1f1f, 0.5));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -headR * 0.28, headR * 0.93);
  head.add(mouth);
  // Feet.
  for (const [x, z] of [[-0.25, 0.22], [0.25, 0.22], [-0.25, -0.2], [0.25, -0.2]]) {
    const foot = mesh(new T.SphereGeometry(0.14, 12, 10), bodyMat);
    foot.scale.set(1, 0.6, 1.2);
    foot.position.set(x, 0.07, z);
    body.add(foot);
  }
  const grow = [0, 0.6, 0.8, 1, 1.25][stage];
  const featureMat = mat(pal.feature, 0.5);
  const accentMat = mat(pal.accent, 0.4);
  let tail: any = null;
  const flames: any[] = [];
  const e = element;

  if (e === 0) {
    // 金: armour plates down the back, a horn; 白虎 gets black stripes and round ears.
    for (let k = 0; k < 2 + stage; k++) {
      const plate = mesh(new T.BoxGeometry(0.34 * grow + 0.1, 0.07, 0.18), legend ? mat(pal.accent, 0.3, { metalness: 0.5 }) : mat(pal.feature, 0.25, { metalness: 0.7 }));
      plate.position.set(0, 0.95 - k * 0.1, -0.1 - k * 0.14);
      plate.rotation.x = -0.5 - k * 0.18;
      body.add(plate);
    }
    const horn = mesh(new T.ConeGeometry(0.07 * grow + 0.03, 0.3 * grow + 0.1, 10), accentMat);
    horn.position.set(0, headR * 0.95, headR * 0.2);
    head.add(horn);
    if (legend) {
      for (const x of [-1, 1]) {
        const ear = mesh(new T.SphereGeometry(headR * 0.25, 12, 10), bodyMat);
        ear.scale.set(1, 1, 0.5);
        ear.position.set(x * headR * 0.7, headR * 0.7, 0);
        head.add(ear);
      }
      for (let k = 0; k < 3; k++) {
        const stripe = new T.Mesh(new T.TorusGeometry(0.5, 0.025, 6, 24, Math.PI * 0.7), mat(0x222222));
        stripe.position.set(0, 0.5, -0.1 - k * 0.15);
        stripe.rotation.set(0, 0, Math.PI * 0.15);
        body.add(stripe);
      }
    }
    tail = mesh(new T.CylinderGeometry(0.05, 0.08, 0.5, 8), bodyMat);
    tail.position.set(0, 0.45, -0.55);
    tail.rotation.x = -0.9;
    body.add(tail);
  } else if (e === 1) {
    // 木: antlers that branch more each stage, with leaves; 青龍 gets gold horns and whiskers.
    for (const x of [-1, 1]) {
      const antler = new T.Group();
      antler.position.set(x * headR * 0.45, headR * 0.8, 0);
      antler.rotation.z = -x * 0.35;
      head.add(antler);
      const len = 0.18 + 0.12 * stage;
      const stem = mesh(new T.CylinderGeometry(0.025, 0.04, len, 6), featureMat);
      stem.position.y = len / 2;
      antler.add(stem);
      for (let k = 1; k < stage + 1; k++) {
        const branch = mesh(new T.CylinderGeometry(0.018, 0.028, len * 0.5, 6), featureMat);
        branch.position.set(x * 0.06, len * (0.35 + k * 0.15), 0);
        branch.rotation.z = -x * 0.8;
        antler.add(branch);
        if (!legend) {
          const leaf = mesh(new T.SphereGeometry(0.06, 8, 6), accentMat);
          leaf.scale.set(1, 0.5, 1.4);
          leaf.position.set(x * 0.16, len * (0.45 + k * 0.15), 0);
          antler.add(leaf);
        }
      }
    }
    if (legend) {
      for (const x of [-1, 1]) {
        const whisker = new T.Mesh(new T.TorusGeometry(0.2, 0.012, 6, 16, Math.PI * 0.6), accentMat);
        whisker.position.set(x * headR * 0.5, -headR * 0.2, headR * 0.7);
        whisker.rotation.set(0, x * 0.6, x > 0 ? Math.PI : 0);
        head.add(whisker);
      }
    }
    tail = mesh(new T.SphereGeometry(0.12, 10, 8), mat(pal.belly));
    tail.position.set(0, 0.55, -0.55);
    body.add(tail);
  } else if (e === 2) {
    // 水: a fin down the back, a tail fin and little horns; 玄武 carries a dark shell.
    if (legend) {
      const shell = mesh(new T.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(pal.feature, 0.6, { flatShading: true }));
      shell.scale.set(1.05, 0.8, 1.1);
      shell.position.y = 0.55;
      body.add(shell);
    } else {
      const fin = mesh(new T.ConeGeometry(0.2 * grow + 0.05, 0.5 * grow + 0.1, 4), featureMat);
      fin.scale.set(0.25, 1, 1);
      fin.position.set(0, 0.95, -0.2);
      fin.rotation.x = -0.4;
      body.add(fin);
    }
    for (const x of [-1, 1]) {
      const horn = mesh(new T.ConeGeometry(0.05, 0.14 + 0.05 * stage, 8), accentMat);
      horn.position.set(x * headR * 0.45, headR * 0.85, -headR * 0.1);
      horn.rotation.z = -x * 0.3;
      head.add(horn);
    }
    tail = new T.Group();
    tail.position.set(0, 0.4, -0.5);
    body.add(tail);
    const stalk = mesh(new T.CylinderGeometry(0.06, 0.12, 0.45, 8), bodyMat);
    stalk.rotation.x = -1.2;
    stalk.position.z = -0.15;
    tail.add(stalk);
    const tfin = mesh(new T.ConeGeometry(0.2 * grow + 0.08, 0.3, 3), featureMat);
    tfin.scale.set(1, 1, 0.25);
    tfin.position.set(0, 0.1, -0.4);
    tfin.rotation.x = -Math.PI / 2;
    tail.add(tfin);
  } else if (e === 3) {
    // 火: fox ears and a flame tail that burns bigger each stage; 朱雀 gets wings and a flame crest.
    for (const x of [-1, 1]) {
      const ear = mesh(new T.ConeGeometry(headR * 0.3, headR * 0.7, 4), bodyMat);
      ear.position.set(x * headR * 0.55, headR * 0.85, 0);
      ear.rotation.z = -x * 0.3;
      head.add(ear);
      if (legend || stage >= 3) {
        const wing = mesh(new T.ConeGeometry(0.25 * grow + 0.05, 0.7 * grow, 3), mat(legend ? pal.accent : pal.feature, 0.5));
        wing.scale.set(1, 1, 0.2);
        wing.position.set(x * 0.5, 0.75, -0.1);
        wing.rotation.z = -x * 1.2;
        body.add(wing);
        flames.push(wing);
      }
    }
    tail = new T.Group();
    tail.position.set(0, 0.45, -0.5);
    body.add(tail);
    for (let k = 0; k < 3; k++) {
      const f = new T.Mesh(
        new T.ConeGeometry(0.16 * grow + 0.05 - k * 0.04, 0.55 * grow + 0.2 - k * 0.1, 10),
        mat(k === 0 ? pal.accent : k === 1 ? pal.feature : 0xfff3b0, 0.4, { emissive: k === 0 ? pal.accent : pal.feature, emissiveIntensity: 0.6 }),
      );
      f.position.set(0, 0.15 + k * 0.05, -0.15);
      f.rotation.x = -0.6;
      tail.add(f);
      flames.push(f);
    }
  } else {
    // 土: a rocky shell that gets craggier; 麒麟 gets a single horn and a green mane.
    if (!legend) {
      const shell = mesh(new T.DodecahedronGeometry(0.5, 0), mat(pal.feature, 0.9, { flatShading: true }));
      shell.scale.set(1.05 + 0.05 * stage, 0.55 + 0.05 * stage, 1.1);
      shell.position.set(0, 0.7, -0.08);
      body.add(shell);
      for (let k = 0; k < stage; k++) {
        const crag = mesh(new T.ConeGeometry(0.08, 0.18, 5), mat(pal.accent, 0.9, { flatShading: true }));
        crag.position.set(Math.cos(k * 2.1) * 0.25, 0.98, -0.1 + Math.sin(k * 2.1) * 0.25);
        body.add(crag);
      }
    } else {
      const horn = mesh(new T.ConeGeometry(0.06, 0.4, 10), mat(0xffd34d, 0.3, { metalness: 0.6 }));
      horn.position.set(0, headR * 1.05, headR * 0.1);
      head.add(horn);
      for (let k = 0; k < 5; k++) {
        const tuft = mesh(new T.SphereGeometry(0.1, 8, 6), featureMat);
        tuft.position.set((k - 2) * 0.1, headR * 0.6, -headR * 0.6);
        head.add(tuft);
      }
    }
    tail = mesh(new T.ConeGeometry(0.08, 0.25, 8), bodyMat);
    tail.position.set(0, 0.3, -0.55);
    tail.rotation.x = -1.8;
    body.add(tail);
  }

  // Gold trim for legendary monsters; a crown and a glowing ring for 王者.
  if (legend) {
    const band = new T.Mesh(new T.TorusGeometry(0.46, 0.03, 8, 32), mat(0xffd34d, 0.3, { metalness: 0.7 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.5;
    body.add(band);
  }
  let aura: any = null;
  if (stage >= 4) {
    const crown = new T.Group();
    crown.position.y = headR * 0.95;
    head.add(crown);
    const gold = mat(0xffd34d, 0.3, { metalness: 0.7, emissive: 0x7a5a00, emissiveIntensity: 0.3 });
    const ring = mesh(new T.CylinderGeometry(headR * 0.42, headR * 0.45, headR * 0.2, 16, 1, true), gold);
    crown.add(ring);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const spike = mesh(new T.ConeGeometry(headR * 0.08, headR * 0.28, 6), gold);
      spike.position.set(Math.cos(a) * headR * 0.43, headR * 0.22, Math.sin(a) * headR * 0.43);
      crown.add(spike);
    }
    aura = new T.Mesh(new T.RingGeometry(0.7, 0.85, 40), new T.MeshBasicMaterial({ color: pal.accent, transparent: true, opacity: 0.5, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.03;
    root.add(aura);
  }

  let nextBlink = 0;
  return {
    group: root,
    height: (1.0 + headR * 1.6) * s,
    update(now) {
      const k = now / 1000;
      body.position.y = Math.abs(Math.sin(k * 2.2)) * 0.06;
      body.scale.set(s * (1 + Math.sin(k * 4.4) * 0.015), s * (1 - Math.sin(k * 4.4) * 0.015), s);
      head.rotation.z = Math.sin(k * 1.3) * 0.08;
      if (tail) tail.rotation.y = Math.sin(k * 5) * 0.35;
      for (const f of flames) f.scale.y = 0.9 + Math.random() * 0.25;
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
