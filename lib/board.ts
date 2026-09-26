export const BOARD_SIZE = 28;
/** Squares per side of the square ring, corners included. 4 × (8 − 1) = 28: six squares between each pair of corners. */
export const BOARD_SIDE = 8;

/**
 * What a square does when you stop on it. Every kind is shown as a picture on the board:
 * 🏁 start, 🪙 coins, 🎁 chest, 🎲 lucky die, 🔨 attack, 🚔 jail, 🧾 tax.
 */
export type TileKind = "start" | "coin" | "chest" | "lucky" | "attack" | "jail" | "tax";

export type Tile = {
  id: string;
  name: string;
  kind: TileKind;
};

/** Names for your four buildings, used when you build, repair or get raided. */
export const LANDMARK_NAMES = ["北門", "東市", "南岸", "西街"] as const;

/** Every fourth square is 攻擊 (2, 6, 10 … 26), so each roll of two dice lands on one 22–28% of the time. */
export const ATTACK_EVERY = 4;
export const ATTACK_OFFSET = 2;
/** The two free corners hold the small penalties; a chest sits on each side; two lucky dice. */
export const JAIL_SQUARE = 7;
export const TAX_SQUARE = 21;
export const CHEST_SQUARES = [4, 11, 17, 25] as const;
export const LUCKY_SQUARES = [9, 23] as const;

export const TILE_INFO: Record<TileKind, { name: string; icon: string }> = {
  start: { name: "起點", icon: "🏁" },
  coin: { name: "金幣", icon: "🪙" },
  chest: { name: "寶箱", icon: "🎁" },
  lucky: { name: "幸運骰", icon: "🎲" },
  attack: { name: "攻擊", icon: "🔨" },
  jail: { name: "監獄", icon: "🚔" },
  tax: { name: "稅局", icon: "🧾" },
};

function kindOf(index: number): TileKind {
  if (index === 0) return "start";
  if (index % ATTACK_EVERY === ATTACK_OFFSET) return "attack";
  if (index === JAIL_SQUARE) return "jail";
  if (index === TAX_SQUARE) return "tax";
  if ((CHEST_SQUARES as readonly number[]).includes(index)) return "chest";
  if ((LUCKY_SQUARES as readonly number[]).includes(index)) return "lucky";
  return "coin";
}

export const TILES: readonly Tile[] = Array.from({ length: BOARD_SIZE }, (_, index) => {
  const kind = kindOf(index);
  return { id: `${kind}-${index}`, name: TILE_INFO[kind].name, kind };
});

/** The board art the squares are laid over (1254 × 1254, transparent around the board). */
export const BOARD_ART = "/art/board-28-cut.png";

/** The castle-garden scene behind the board (1600 × 2848), and where the board sits on it. */
export const BOARD_SCENE = {
  art: "/art/board-scene.jpg",
  width: 1600,
  height: 2848,
  /** The board's box on the scene, as fractions of the scene: it covers the diamond lawn. */
  board: { left: 0.0706, top: 0.4066, width: 0.86 },
} as const;

/**
 * Centre of each square on the board art, in pixels, measured from the art.
 * Start is the bottom corner; play runs up the lower-left edge, across the top, and back
 * down the lower-right edge.
 */
const ART_POINTS: readonly [number, number][] = [
  [619, 997],
  [537, 921], [461, 850], [386, 779], [312, 710], [242, 643], [174, 579],
  [107, 514],
  [185, 458], [256, 404], [334, 345], [410, 287], [483, 231], [553, 177],
  [627, 120],
  [699, 177], [768, 232], [840, 288], [914, 347], [990, 406], [1063, 463],
  [1142, 523],
  [1073, 587], [1004, 650], [932, 716], [857, 784], [780, 853], [703, 923],
];
const ART_SIZE = 1254;

export const TILE_POSITIONS: readonly { x: number; y: number }[] = ART_POINTS.map(([x, y]) => ({
  x: x / ART_SIZE,
  y: y / ART_SIZE,
}));

/** Where the green centre sits on the art, for the score panel. */
export const BOARD_CENTRE = { x: 625 / ART_SIZE, y: 555 / ART_SIZE } as const;
