export const BOARD_SIZE = 28;
/** Squares per side of the square ring, corners included. 4 × (8 − 1) = 28: six squares between each pair of corners. */
export const BOARD_SIDE = 8;

export type TileKind = "start" | "street" | "landmark" | "attack";

export type Tile = {
  id: string;
  name: string;
  kind: TileKind;
  landmarkIndex: number | null;
};

export const LANDMARK_NAMES = ["北門", "東市", "南岸", "西街"] as const;

/** Every fourth square is 攻擊 (2, 6, 10 … 26), so each roll of two dice lands on one 22–28% of the time. */
export const ATTACK_EVERY = 4;
export const ATTACK_OFFSET = 2;
/** One landmark per side of the board, clear of the corners and the 攻擊 squares. */
export const LANDMARK_SQUARES = [4, 11, 17, 25] as const;

const STREET_NAMES = [
  "巷口", "茶檔", "公園", "碼頭", "花墟", "書局", "魚市", "戲院",
  "電車站", "涼茶鋪", "糖水店", "麵包舖", "鐘樓", "海旁", "夜市", "燈塔",
];

function buildTiles(): Tile[] {
  const tiles: Tile[] = [];
  let street = 0;
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const landmarkIndex = (LANDMARK_SQUARES as readonly number[]).indexOf(index);
    if (index === 0) {
      tiles.push({ id: "start", name: "起點", kind: "start", landmarkIndex: null });
    } else if (index % ATTACK_EVERY === ATTACK_OFFSET) {
      tiles.push({ id: `attack-${index}`, name: "攻擊", kind: "attack", landmarkIndex: null });
    } else if (landmarkIndex !== -1) {
      tiles.push({
        id: `landmark-${index}`,
        name: LANDMARK_NAMES[landmarkIndex],
        kind: "landmark",
        landmarkIndex,
      });
    } else {
      tiles.push({ id: `street-${index}`, name: STREET_NAMES[street], kind: "street", landmarkIndex: null });
      street += 1;
    }
  }
  return tiles;
}

export const TILES: readonly Tile[] = buildTiles();

/** The board art the squares are laid over (1254 × 1254). */
export const BOARD_ART = "/art/board-28-mario.png";

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
