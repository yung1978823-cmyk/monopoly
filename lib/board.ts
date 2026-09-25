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
export const BOARD_ART = "/art/board-28.png";

/**
 * Centre of each square on the board art, as a fraction of the image width and height.
 * Measured from public/art/board-28.png. Start is the bottom corner; play runs up the
 * lower-left edge, across the top, and back down the lower-right edge.
 */
const ART_POINTS: readonly [number, number][] = [
  [618, 988],
  [538, 916], [461, 849], [386, 778], [309, 711], [240, 642], [173, 578],
  [107, 513],
  [183, 455], [255, 400], [333, 341], [409, 284], [482, 229], [553, 175],
  [627, 114],
  [699, 175], [768, 228], [840, 285], [913, 345], [993, 404], [1065, 461],
  [1145, 523],
  [1073, 582], [1004, 639], [933, 714], [857, 782], [781, 852], [704, 921],
];
const ART_SIZE = 1254;

export const TILE_POSITIONS: readonly { x: number; y: number }[] = ART_POINTS.map(([x, y]) => ({
  x: x / ART_SIZE,
  y: y / ART_SIZE,
}));

/** Where the red velvet centre sits on the art, for the score panel. */
export const BOARD_CENTRE = { x: 626 / ART_SIZE, y: 551 / ART_SIZE } as const;
