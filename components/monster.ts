import { loadGltfLoader } from "@/components/eight-scene";

/**
 * The dragons, built in code (no model files yet): chubby, big-eyed baby dragons with wings from
 * the moment they hatch, since they fly out to attack other players' land. Three attributes, each
 * its own colours and touches — 光 cream and gold with golden wings, 暗 deep purple with bat wings,
 * 混濁 murky teal and purple with odd-coloured horns and wings. Grade 0 is an egg (plain, so the
 * attribute is a surprise at hatching); N → R → SR → SSR grow the dragon, its wings, horns and back
 * spikes, and SSR glows with a gem and a ring. Legendary (NFT) dragons carry a gold collar and a
 * second pair of horns.
 */
export type Monster = {
  group: any;
  /** Call every frame with performance.now(). */
  update(now: number): void;
  /** Roughly how tall it stands, for placing things above it. */
  height: number;
  /** How it carries itself: resting, walking (small hops), flying (fast wing beats), asleep
   * (eyes shut, wings folded, slow breathing) or happy (bouncy, wings up). */
  setMood(mood: Mood): void;
};

export type Mood = "rest" | "walk" | "fly" | "sleep" | "happy";

const PALETTE = [
  // 光
  { body: 0xfff1d2, belly: 0xffdf8a, wing: 0xffcf4a, wingEdge: 0xe8a820, horn: 0xffc02e, accent: 0xfff0a0, glow: 0xffe066, horn2: 0xffc02e, wing2: 0xffcf4a },
  // 暗
  { body: 0x4a2c78, belly: 0x9277c9, wing: 0x7b3fd0, wingEdge: 0x2a1648, horn: 0xd8d4e8, accent: 0xc27dff, glow: 0xb45cff, horn2: 0xd8d4e8, wing2: 0x7b3fd0 },
  // 混濁
  { body: 0x4f8f80, belly: 0xc2d6b0, wing: 0x7a58a8, wingEdge: 0x2f5b52, horn: 0x9e7cc8, accent: 0xa8f06a, glow: 0x9dff6b, horn2: 0x6fcf8c, wing2: 0x4fae8f },
];
const SIZE = [0.7, 0.62, 0.8, 0.98, 1.15];

/**
 * Dragons made as 3D models (from the approved three-view art). Each file has three parts —
 * "body", "wingL" and "wingR" — with each wing's pivot at its shoulder, so the wings flap in code.
 * The model stands 1 unit tall, facing +z. Attributes without a model yet use the code-built dragon.
 */
const MODELS: Record<number, string> = { 0: "/models/dragon-light.glb" };
/** How tall the model dragon stands at each grade (N → SSR). */
const MODEL_HEIGHT = [0, 1.0, 1.2, 1.42, 1.7];
const modelCache: Record<number, Promise<any>> = {};

function loadModel(T: any, element: number): Promise<any> {
  if (!modelCache[element]) {
    modelCache[element] = loadGltfLoader(T).then(
      (Loader) =>
        new Promise((resolve, reject) => {
          new Loader().load(MODELS[element], (gltf: any) => resolve(gltf.scene), undefined, reject);
        }),
    );
    modelCache[element].catch(() => delete modelCache[element]);
  }
  return modelCache[element];
}

function modelDragon(T: any, element: number, stage: number, legend: boolean, root: any, body: any): Monster {
  const pal = PALETTE[element] ?? PALETTE[0];
  const h = MODEL_HEIGHT[stage];
  body.scale.setScalar(h);
  let wingL: any = null;
  let wingR: any = null;
  let fallback: Monster | null = null;
  loadModel(T, element)
    .then((scene) => {
      const model = scene.clone(true);
      model.traverse((o: any) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = false;
        }
      });
      wingL = model.getObjectByName("wingL");
      wingR = model.getObjectByName("wingR");
      body.add(model);
    })
    .catch(() => {
      // No model (offline?): fall back to the code-built dragon.
      fallback = buildMonster(T, element, stage, legend, false);
      fallback.setMood(mood);
      root.remove(body);
      if (aura) root.remove(aura);
      root.add(fallback.group);
    });

  let aura: any = null;
  if (stage >= 4) {
    aura = new T.Mesh(
      new T.RingGeometry(0.75, 0.9, 48),
      new T.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.5, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }),
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.03;
    root.add(aura);
  }

  let mood: Mood = "rest";
  return {
    group: root,
    height: h,
    setMood(next) {
      mood = next;
      fallback?.setMood(next);
    },
    update(now) {
      if (fallback) return fallback.update(now);
      const k = now / 1000;
      const asleep = mood === "sleep";
      let y = 0, roll = 0, pitch = 0;
      if (mood === "walk") {
        // A waddle: rock side to side with a little hop each step.
        y = Math.abs(Math.sin(k * 8)) * 0.06;
        roll = Math.sin(k * 8) * 0.12;
      } else if (mood === "happy") {
        y = Math.abs(Math.sin(k * 8)) * 0.2;
      } else if (mood === "fly") {
        y = Math.sin(k * 8) * 0.04;
        pitch = 0.25;
      } else if (asleep) {
        pitch = 0.12;
      } else {
        y = Math.abs(Math.sin(k * 2.2)) * 0.03;
      }
      body.position.y = y;
      body.rotation.z = roll;
      body.rotation.x = pitch;
      const breathe = asleep ? Math.sin(k * 1.6) * 0.03 : Math.sin(k * 4.4) * 0.012;
      body.scale.set(h * (1 + breathe), h * (1 - breathe * 0.6), h);
      // Wing angle: positive lifts them. Fast beats in flight, up and fluttering when happy,
      // folded down asleep, otherwise a lazy flap now and then.
      const beat =
        mood === "fly"
          ? Math.sin(k * 16) * 0.6
          : mood === "happy"
            ? 0.25 + Math.sin(k * 12) * 0.3
            : asleep
              ? -0.45
              : Math.sin(k * 7) * 0.35 * Math.max(0, Math.sin(k * 0.8)) ** 2;
      if (wingL) wingL.rotation.z = -beat;
      if (wingR) wingR.rotation.z = beat;
      if (aura) {
        aura.rotation.z = k * 0.8;
        aura.material.opacity = 0.35 + Math.sin(k * 3) * 0.15;
      }
    },
  };
}
const HEAD = [0, 0.48, 0.45, 0.42, 0.4];

export function buildMonster(T: any, element: number, stage: number, legend = false, useModel = true): Monster {
  stage = Math.max(0, Math.min(4, stage));
  const pal = PALETTE[element] ?? PALETTE[0];
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

  // ---------- Dragon egg ----------
  if (stage === 0) {
    const egg = ball(0.42, mat(0xf6ead0, 0.4));
    egg.scale.set(1, 1.3, 1);
    egg.position.y = 0.55;
    body.add(egg);
    // Scale-like speckles in gold and a band of hexagon plates round the middle.
    const plate = mat(0xd9a93a, 0.35, { metalness: 0.3 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const hex = mesh(new T.CylinderGeometry(0.07, 0.07, 0.02, 6), plate);
      hex.position.set(Math.cos(a) * 0.415, 0.52, Math.sin(a) * 0.415);
      hex.lookAt(Math.cos(a) * 2, 0.52, Math.sin(a) * 2);
      hex.rotateX(Math.PI / 2);
      body.add(hex);
    }
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, y = 0.3 + (k % 3) * 0.28;
      const r = 0.42 * Math.sqrt(Math.max(0.1, 1 - ((y - 0.55) / 0.55) ** 2));
      const dot = ball(0.035, mat(0xc98f2a, 0.5), 0.3);
      dot.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      body.add(dot);
    }
    return {
      group: root,
      height: 1.1 * s,
      setMood() {
        // An egg just wobbles.
      },
      update(now) {
        // A little wobble now and then, as if something inside wants out.
        const k = now / 1000;
        const kick = Math.max(0, Math.sin(k * 1.7)) ** 12;
        body.rotation.z = Math.sin(k * 14) * 0.12 * kick;
        body.position.y = Math.abs(Math.sin(k * 14)) * 0.04 * kick;
      },
    };
  }

  if (useModel && MODELS[element]) return modelDragon(T, element, stage, legend, root, body);

  const headR = HEAD[stage];
  const bodyMat = mat(pal.body, 0.45);
  const bellyMat = mat(pal.belly, 0.6);
  const hornMat = mat(pal.horn, 0.35, { metalness: element === 0 ? 0.4 : 0.1 });
  const horn2Mat = mat(pal.horn2, 0.35);
  const glowMat = mat(pal.accent, 0.3, { emissive: pal.glow, emissiveIntensity: 0.8 });

  // ---------- Body ----------
  const torso = ball(0.5, bodyMat);
  torso.scale.set(0.95, 0.92, 1.02);
  torso.position.y = 0.5;
  body.add(torso);
  // A belly plate with ridges, like a dragon's underside.
  const plate = ball(0.5, bellyMat);
  plate.scale.set(0.62, 0.78, 0.34);
  plate.position.set(0, 0.46, 0.32);
  body.add(plate);
  for (let k = 0; k < 4; k++) {
    const ridge = new T.Mesh(new T.TorusGeometry(0.2 - Math.abs(k - 1.5) * 0.025, 0.012, 6, 20, Math.PI), mat(pal.body, 0.5));
    ridge.position.set(0, 0.28 + k * 0.12, 0.47 - Math.abs(k - 1.5) * 0.02);
    ridge.rotation.z = Math.PI;
    body.add(ridge);
  }
  for (const [x, z] of [[-0.24, 0.2], [0.24, 0.2], [-0.24, -0.2], [0.24, -0.2]]) {
    const foot = ball(0.14, bodyMat, 0.5);
    foot.scale.set(1, 0.6, 1.25);
    foot.position.set(x, 0.07, z);
    body.add(foot);
    for (const cx of [-0.05, 0, 0.05]) {
      const claw = mesh(new T.ConeGeometry(0.02, 0.06, 6), hornMat);
      claw.rotation.x = Math.PI / 2;
      claw.position.set(x + cx, 0.05, z + 0.17);
      body.add(claw);
    }
  }
  for (const x of [-1, 1]) {
    const arm = ball(0.11, bodyMat, 0.5);
    arm.scale.set(0.8, 1.2, 0.8);
    arm.position.set(x * 0.42, 0.42, 0.2);
    arm.rotation.z = x * 0.5;
    body.add(arm);
  }

  // ---------- Head ----------
  const head = new T.Group();
  head.position.set(0, 0.9 + headR * 0.55, 0.08);
  body.add(head);
  head.add(ball(headR, bodyMat));
  const snout = ball(headR * 0.5, bellyMat, 0.7);
  snout.scale.set(1.1, 0.72, 0.95);
  snout.position.set(0, -headR * 0.3, headR * 0.72);
  head.add(snout);
  for (const x of [-1, 1]) {
    const nostril = ball(headR * 0.05, mat(0x3a2020, 0.4), 0.3);
    nostril.position.set(x * headR * 0.15, -headR * 0.2, headR * 1.15);
    head.add(nostril);
  }
  const eyes: any[] = [];
  for (const x of [-1, 1]) {
    const eye = new T.Group();
    eye.position.set(x * headR * 0.42, headR * 0.18, headR * 0.72);
    eye.rotation.y = x * 0.3;
    head.add(eye);
    const white = ball(headR * 0.3, mat(0xffffff, 0.25), 0.6);
    white.scale.z = 0.7;
    eye.add(white);
    const iris = ball(headR * 0.22, mat(element === 1 ? 0x9b4dff : element === 2 ? 0x3aa66a : 0x3b82f6, 0.2), 0.6);
    iris.scale.z = 0.55;
    iris.position.z = headR * 0.09;
    eye.add(iris);
    const pupil = ball(headR * 0.13, mat(0x14141f, 0.15), 0.5);
    pupil.scale.z = 0.5;
    pupil.position.z = headR * 0.15;
    eye.add(pupil);
    for (const [dx, dy, r] of [[0.08, 0.09, 0.075], [-0.06, -0.06, 0.035]]) {
      const shine = new T.Mesh(new T.SphereGeometry(headR * r, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(headR * dx, headR * dy, headR * 0.24);
      eye.add(shine);
    }
    eyes.push(eye);
    const cheek = new T.Mesh(new T.CircleGeometry(headR * 0.12, 20), new T.MeshBasicMaterial({ color: 0xff7f96, transparent: true, opacity: 0.5, depthWrite: false }));
    const cx = x * headR * 0.66, cy = -headR * 0.18;
    cheek.position.set(cx, cy, Math.sqrt(Math.max(0, headR * headR - cx * cx - cy * cy)) + 0.005);
    cheek.lookAt(cx * 3, cy * 3, headR * 3);
    head.add(cheek);
    // Horns sweeping back; 混濁 has one of each colour.
    const hornLen = 0.16 + 0.1 * stage;
    const horn = mesh(new T.ConeGeometry(0.055 + 0.01 * stage, hornLen, 10), x < 0 ? hornMat : horn2Mat);
    horn.position.set(x * headR * 0.45, headR * 0.82, -headR * 0.25);
    horn.rotation.set(-0.7, 0, -x * 0.35);
    head.add(horn);
    if (legend) {
      const small = mesh(new T.ConeGeometry(0.04, hornLen * 0.6, 8), mat(0xffd34d, 0.3, { metalness: 0.6 }));
      small.position.set(x * headR * 0.75, headR * 0.5, -headR * 0.3);
      small.rotation.set(-0.9, 0, -x * 0.9);
      head.add(small);
    }
    // Little fin-ears.
    const ear = mesh(new T.ConeGeometry(headR * 0.16, headR * 0.45, 3), mat(x < 0 ? pal.wing : pal.wing2, 0.5));
    ear.scale.set(1, 1, 0.3);
    ear.position.set(x * headR * 0.92, headR * 0.3, -headR * 0.1);
    ear.rotation.set(0, x * 0.5, -x * 1.2);
    head.add(ear);
  }
  const mouth = new T.Mesh(new T.TorusGeometry(headR * 0.12, headR * 0.022, 6, 14, Math.PI), mat(0x5a2a2a, 0.5));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -headR * 0.5, headR * 0.93);
  head.add(mouth);
  if (stage >= 4) {
    // SSR: a glowing gem on the brow.
    const gem = mesh(new T.OctahedronGeometry(headR * 0.14, 0), glowMat);
    gem.position.set(0, headR * 0.55, headR * 0.8);
    head.add(gem);
  }
  if (legend) {
    const collar = mesh(new T.TorusGeometry(0.3, 0.035, 8, 28), mat(0xffd34d, 0.3, { metalness: 0.7 }));
    collar.rotation.x = Math.PI / 2 - 0.2;
    collar.position.set(0, 0.88, 0.05);
    body.add(collar);
  }

  // ---------- Back spikes ----------
  for (let k = 0; k < 1 + stage; k++) {
    const spike = mesh(new T.ConeGeometry(0.05 + 0.01 * stage, 0.12 + 0.03 * stage, 6), k % 2 && element === 2 ? horn2Mat : hornMat);
    const a = 0.35 + k * 0.3;
    spike.position.set(0, 0.5 + Math.cos(a) * 0.46, -Math.sin(a) * 0.48);
    spike.rotation.x = -a;
    body.add(spike);
  }

  // ---------- Wings (they flap) ----------
  const wingShape = new T.Shape();
  // Bat-style wing: a bony top edge with three scalloped fingers.
  wingShape.moveTo(0, 0);
  wingShape.lineTo(0.95, 0.35);
  wingShape.quadraticCurveTo(0.8, 0.05, 0.82, -0.12);
  wingShape.quadraticCurveTo(0.62, -0.05, 0.55, -0.25);
  wingShape.quadraticCurveTo(0.38, -0.14, 0.28, -0.32);
  wingShape.quadraticCurveTo(0.14, -0.15, 0, -0.18);
  wingShape.lineTo(0, 0);
  const wingGeo = new T.ShapeGeometry(wingShape, 12);
  const wings: { pivot: any; side: number }[] = [];
  for (const x of [-1, 1]) {
    const pivot = new T.Group();
    pivot.position.set(x * 0.22, 0.78, -0.24);
    body.add(pivot);
    const holder = new T.Group();
    // Wings grow with each grade, but not so much they swamp the body.
    const span = [0, 0.55, 0.68, 0.82, 0.95][stage];
    holder.scale.set(x * span, span, span);
    holder.rotation.y = x * 0.35;
    pivot.add(holder);
    const membrane = new T.Mesh(
      wingGeo,
      mat(x < 0 ? pal.wing : pal.wing2, 0.55, {
        side: T.DoubleSide,
        emissive: stage >= 4 ? pal.glow : 0x000000,
        emissiveIntensity: stage >= 4 ? 0.25 : 0,
      }),
    );
    membrane.castShadow = true;
    holder.add(membrane);
    const bone = mesh(new T.CylinderGeometry(0.018, 0.03, 1.0, 8), mat(pal.wingEdge, 0.45));
    bone.rotation.z = -Math.PI / 2 + Math.atan2(0.35, 0.95);
    bone.position.set(0.47, 0.17, 0.005);
    holder.add(bone);
    const claw = mesh(new T.ConeGeometry(0.035, 0.1, 6), hornMat);
    claw.position.set(0.97, 0.38, 0);
    claw.rotation.z = -0.9;
    holder.add(claw);
    wings.push({ pivot, side: x });
  }

  // ---------- Tail ----------
  const tail = new T.Group();
  tail.position.set(0, 0.3, -0.42);
  body.add(tail);
  let z = 0, y = 0;
  const segs = 4 + Math.min(2, stage);
  for (let k = 0; k < segs; k++) {
    const r = 0.13 - k * 0.018;
    const seg = ball(Math.max(0.045, r), bodyMat, 0.5);
    z -= Math.max(0.045, r) * 1.3;
    y += 0.02 + k * 0.012;
    seg.position.set(0, y, z);
    tail.add(seg);
  }
  const tip = mesh(new T.OctahedronGeometry(0.07 + 0.01 * stage, 0), element === 2 ? horn2Mat : hornMat);
  tip.scale.set(1, 1.1, 0.35);
  tip.position.set(0, y + 0.05, z - 0.1);
  tip.rotation.x = -0.6;
  tail.add(tip);

  let aura: any = null;
  if (stage >= 4) {
    aura = new T.Mesh(new T.RingGeometry(0.75, 0.9, 48), new T.MeshBasicMaterial({ color: pal.glow, transparent: true, opacity: 0.5, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.03;
    root.add(aura);
  }

  let nextBlink = 0;
  let mood: Mood = "rest";
  return {
    group: root,
    height: (0.9 + headR * 1.6) * s,
    setMood(next) {
      mood = next;
    },
    update(now) {
      const k = now / 1000;
      const asleep = mood === "sleep";
      if (mood === "walk") {
        // Waddling hops.
        body.position.y = Math.abs(Math.sin(k * 9)) * 0.1;
        body.rotation.z = Math.sin(k * 9) * 0.1;
      } else if (mood === "happy") {
        body.position.y = Math.abs(Math.sin(k * 8)) * 0.25;
        body.rotation.z = 0;
      } else if (asleep) {
        body.position.y = -0.08;
        body.rotation.z = 0;
      } else {
        body.position.y = Math.abs(Math.sin(k * 2.2)) * 0.05;
        body.rotation.z = 0;
      }
      const breathe = asleep ? Math.sin(k * 1.6) * 0.04 : Math.sin(k * 4.4) * 0.015;
      body.scale.set(s * (1 + breathe), s * (1 - breathe * (asleep ? 0.5 : 1)), s);
      head.rotation.z = asleep ? 0.25 : Math.sin(k * 1.3) * 0.08;
      head.rotation.x = asleep ? 0.35 : Math.sin(k * 0.9) * 0.04;
      tail.rotation.y = Math.sin(k * (mood === "happy" ? 12 : asleep ? 0.8 : 3)) * 0.35;
      // Wings: fast beats in flight, raised when happy, folded asleep, otherwise a quick flap now and then.
      const beat =
        mood === "fly"
          ? Math.sin(k * 16) * 0.7
          : mood === "happy"
            ? 0.3 + Math.sin(k * 10) * 0.35
            : asleep
              ? -0.55
              : Math.sin(k * 7) * 0.45 * (0.4 + 0.6 * Math.max(0, Math.sin(k * 0.8)));
      for (const w of wings) w.pivot.rotation.z = w.side * (0.35 + beat);
      if (now > nextBlink) nextBlink = now + 2500 + Math.random() * 2500;
      const blink = asleep ? 0.08 : nextBlink - now < 120 ? 0.1 : 1;
      for (const eye of eyes) eye.scale.y = blink;
      if (aura) {
        aura.rotation.z = k * 0.8;
        aura.material.opacity = 0.35 + Math.sin(k * 3) * 0.15;
      }
    },
  };
}
