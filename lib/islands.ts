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
 * 森林礦島 (Sky 2026-10-09, second drawing): an empty island — Sky drew only the ground, stairs and bridge; the 18
 * squares and stone paths are laid on by us. Plaza at the front → quarry (left) → forest (back) → mine (right).
 */
export const ISLANDS: IslandArt[] = [
  {
    id: "forest",
    name: "森林礦島",
    art: "/art/islands/forest.webp",
    w: 941,
    h: 1240,
    top: 220,
    squares: [
      { x: 470, y: 872 },
      // 石場
      { x: 268, y: 522 }, { x: 185, y: 530 }, { x: 108, y: 485 }, { x: 96, y: 415 }, { x: 150, y: 368 }, { x: 232, y: 380 },
      // 森林
      { x: 345, y: 172 }, { x: 305, y: 112 }, { x: 382, y: 66 }, { x: 490, y: 54 }, { x: 590, y: 74 }, { x: 630, y: 140 },
      // 礦場
      { x: 728, y: 392 }, { x: 815, y: 392 }, { x: 875, y: 452 }, { x: 860, y: 522 }, { x: 780, y: 550 }, { x: 698, y: 528 },
    ],
    nest: { x: 470, y: 840, w: 250 },
    falls: [
      { x: 95, y: 618, w: 48, h: 125 },
      { x: 797, y: 620, w: 48, h: 125 },
      { x: 446, y: 912, w: 62, h: 125 },
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
