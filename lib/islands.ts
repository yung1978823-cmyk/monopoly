/**
 * 領地 painted islands (Sky 2026-10-09): picture, squares, dragon nest, waterfalls and decoration spots — shared by
 * the 我嘅領地 page and the game board. All positions are in the picture's own pixels.
 */
export type At = { x: number; y: number };
export type Fall = At & { w: number; h: number };
/** 裝飾位 sizes (Sky 2026-10-09: fixed spots, no free placing): big things, small things, things in the sky. */
export type SpotKind = "big" | "small" | "sky";
export type IslandArt = {
  id: string;
  name: string;
  art: string;
  w: number;
  h: number;
  /** Where this picture was cut from Sky's original (the board's world maths uses the original's pixels). */
  top: number;
  /** Where players stand on each square: the plaza first, then o1…o18 in walking order. */
  squares: At[];
  /** 龍巢 on the plaza: the foot of the nest picture and its width; the player's own dragon lies in it. */
  nest: At & { w: number };
  /** Sky's dry cliff channels, where code runs the water. */
  falls: Fall[];
  /** 裝飾位, fixed. */
  spots: (At & { kind: SpotKind })[];
  /** What stands on the spots (empty until decorations are bought). */
  decor: { kind: DecorKind; spot: number; w: number }[];
};

/** 裝飾 (Sky's drawings 2026-10-09); code moves them — the flag waves, the balloon floats, the airship sails. */
export type DecorKind = "windmill" | "tower" | "dragon" | "balloon" | "airship";
export const DECOR_DIR = "/art/islands/decor/";

/**
 * 森林礦島 (Sky 2026-10-09, third drawing): separate plateaus and no stairs — the 18 squares are floating stones
 * (Sky's stone picture) that hop between them. Plaza at the front → quarry (left) → forest (back) → mine (right).
 */
export const ISLANDS: IslandArt[] = [
  {
    id: "forest",
    name: "森林礦島",
    art: "/art/islands/forest.webp",
    w: 941,
    h: 1230,
    top: 230,
    squares: [
      { x: 478, y: 838 },
      // 平地 → 石場 → 森林 → 礦場 → 平地: floating stones all the way (Sky 2026-10-09: stones are the bridges)
      { x: 308, y: 623 }, { x: 233, y: 558 }, { x: 167, y: 484 }, { x: 126, y: 395 }, { x: 134, y: 299 }, { x: 208, y: 241 },
      { x: 283, y: 216 }, { x: 334, y: 133 }, { x: 421, y: 91 }, { x: 519, y: 85 }, { x: 614, y: 110 }, { x: 680, y: 180 },
      { x: 753, y: 244 }, { x: 837, y: 287 }, { x: 835, y: 372 }, { x: 760, y: 435 }, { x: 689, y: 501 }, { x: 630, y: 580 },
    ],
    nest: { x: 478, y: 805, w: 250 },
    falls: [
      { x: 118, y: 575, w: 38, h: 180 },
      { x: 776, y: 570, w: 38, h: 180 },
      { x: 460, y: 875, w: 42, h: 170 },
    ],
    spots: [
      { x: 470, y: 165, kind: "big" },
      { x: 470, y: 430, kind: "big" },
      { x: 300, y: 445, kind: "big" },
      { x: 765, y: 470, kind: "big" },
      { x: 410, y: 340, kind: "small" },
      { x: 545, y: 340, kind: "small" },
      { x: 400, y: 580, kind: "small" },
      { x: 545, y: 580, kind: "small" },
      { x: 225, y: 735, kind: "small" },
      { x: 715, y: 735, kind: "small" },
      { x: 395, y: 210, kind: "small" },
      { x: 555, y: 210, kind: "small" },
      { x: 110, y: 110, kind: "sky" },
      { x: 830, y: 110, kind: "sky" },
    ],
    decor: [],
  },
];
