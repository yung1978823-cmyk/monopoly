/**
 * 領地 painted islands (Sky 2026-10-09): picture, castle, waterfalls, decoration spots — shared by the 我嘅領地
 * page and the game board.
 */
/** A spot on the picture, in the picture's own pixels. */
export type At = { x: number; y: number };
export type Fall = At & { w: number; h: number };
export type IslandArt = {
  id: string;
  name: string;
  art: string;
  w: number;
  h: number;
  /** Where the castle stands (the middle of the plaza). */
  castle: At;
  /** Sky's dry cliff channels, where code runs the water. */
  falls: Fall[];
  /** 裝飾位: where bought decorations stand (the foot of the thing), plus two in the sky. */
  spots: At[];
  /** What stands where for now (Sky 2026-10-09: placed to see the look; buying comes later). */
  decor: { kind: DecorKind; spot: number; w: number }[];
};

/** 裝飾 (Sky's drawings 2026-10-09); code moves them — blades turn, the flag waves, the dragon breathes. */
export type DecorKind = "windmill" | "tower" | "dragon" | "balloon" | "airship";
export const DECOR_NAMES: Record<DecorKind, string> = { windmill: "風車", tower: "瞭望塔", dragon: "小龍", balloon: "熱氣球", airship: "飛船" };
export const DECOR_DIR = "/art/islands/decor/";

/**
 * 領地 islands (Sky 2026-10-09): each one a painted island on its own. The first is 森林礦島: castle plaza at the
 * front, quarry up the left, forest at the back, gold mine down the right (18 squares + the castle).
 */
export const ISLANDS: IslandArt[] = [
  {
    id: "forest",
    name: "森林礦島",
    art: "/art/islands/forest.webp",
    w: 941,
    h: 1360,
    castle: { x: 470, y: 925 },
    falls: [
      { x: 451, y: 62, w: 40, h: 86 },
      { x: 60, y: 560, w: 38, h: 175 },
      { x: 866, y: 555, w: 30, h: 175 },
    ],
    spots: [
      { x: 462, y: 392 },
      { x: 478, y: 610 },
      { x: 220, y: 895 },
      { x: 665, y: 965 },
      { x: 95, y: 330 },
      { x: 470, y: 150 },
    ],
    decor: [
      { kind: "windmill", spot: 0, w: 92 },
      { kind: "dragon", spot: 2, w: 135 },
      { kind: "tower", spot: 3, w: 80 },
      { kind: "balloon", spot: 4, w: 120 },
      { kind: "airship", spot: 5, w: 230 },
    ],
  },
];

