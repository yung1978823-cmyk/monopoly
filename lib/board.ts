export const BOARD_SIZE = 12;

export type TileKind = "start" | "street" | "landmark";

export type Tile = {
  id: string;
  name: string;
  kind: TileKind;
  landmarkIndex: number | null;
};

export const LANDMARK_NAMES = ["北門", "東市", "南岸", "西街"] as const;

export const TILES: readonly Tile[] = [
  { id: "start", name: "起點", kind: "start", landmarkIndex: null },
  { id: "alley", name: "巷口", kind: "street", landmarkIndex: null },
  { id: "north", name: "北門", kind: "landmark", landmarkIndex: 0 },
  { id: "tea", name: "茶檔", kind: "street", landmarkIndex: null },
  { id: "park", name: "公園", kind: "street", landmarkIndex: null },
  { id: "east", name: "東市", kind: "landmark", landmarkIndex: 1 },
  { id: "pier", name: "碼頭", kind: "street", landmarkIndex: null },
  { id: "south", name: "南岸", kind: "landmark", landmarkIndex: 2 },
  { id: "market", name: "市集", kind: "street", landmarkIndex: null },
  { id: "west", name: "西街", kind: "landmark", landmarkIndex: 3 },
  { id: "night", name: "夜市", kind: "street", landmarkIndex: null },
  { id: "home", name: "回家路", kind: "street", landmarkIndex: null },
];

export const TILE_PLACEMENT = [
  "col-start-1 row-start-1",
  "col-start-2 row-start-1",
  "col-start-3 row-start-1",
  "col-start-4 row-start-1",
  "col-start-4 row-start-2",
  "col-start-4 row-start-3",
  "col-start-4 row-start-4",
  "col-start-3 row-start-4",
  "col-start-2 row-start-4",
  "col-start-1 row-start-4",
  "col-start-1 row-start-3",
  "col-start-1 row-start-2",
] as const;
