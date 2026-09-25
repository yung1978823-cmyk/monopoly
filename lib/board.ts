export const BOARD_SIZE = 40;
/** Squares per side of the square ring, corners included. 4 × (11 − 1) = 40. */
export const BOARD_SIDE = 11;

export type TileKind = "start" | "street" | "landmark" | "attack";

export type Tile = {
  id: string;
  name: string;
  kind: TileKind;
  landmarkIndex: number | null;
};

export const LANDMARK_NAMES = ["北門", "東市", "南岸", "西街"] as const;

/** Every fifth square is 攻擊 (2, 7, 12 … 37), so each roll of two dice lands on one about 20% of the time. */
export const ATTACK_EVERY = 5;
export const ATTACK_OFFSET = 2;
/** One landmark per side of the board. */
export const LANDMARK_SQUARES = [8, 18, 28, 38] as const;

const STREET_NAMES = [
  "巷口", "茶檔", "公園", "碼頭", "花墟", "書局", "魚市", "戲院", "電車站",
  "涼茶鋪", "雀館", "米舖", "當舖", "照相館", "糖水店", "麵包舖", "布行", "金舖",
  "藥房", "鐘樓", "渡輪站", "海旁", "山頂", "球場", "廟街", "夜市", "燈塔",
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

/**
 * Grid cell (1-based column and row on an 11 × 11 grid) for each square.
 * Start sits in the bottom-right corner and play runs clockwise: left along the bottom,
 * up the left side, right along the top, down the right side.
 */
export const TILE_PLACEMENT: readonly { col: number; row: number }[] = TILES.map((_, index) => {
  const last = BOARD_SIDE;
  const edge = BOARD_SIDE - 1;
  if (index < edge) return { col: last - index, row: last };
  if (index < edge * 2) return { col: 1, row: last - (index - edge) };
  if (index < edge * 3) return { col: 1 + (index - edge * 2), row: 1 };
  return { col: last, row: 1 + (index - edge * 3) };
});
