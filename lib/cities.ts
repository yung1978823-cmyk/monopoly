/** A rival's city: the art shown when you land on 攻擊, and where each landmark stands on it. */
export type City = {
  id: string;
  name: string;
  art: string;
  /** Art size in pixels, for its aspect ratio. */
  width: number;
  height: number;
  /** Colours at the top and bottom edge of the art, to fill the screen around it. */
  sky: string;
  ground: string;
  /** Centre of landmark slots 0–3 (北門、東市、南岸、西街) as fractions of the art. */
  targets: readonly { x: number; y: number }[];
};

function city(
  id: string,
  name: string,
  width: number,
  height: number,
  sky: string,
  ground: string,
  points: readonly [number, number][],
): City {
  return {
    id,
    name,
    art: `/art/city-${id}.jpg`,
    width,
    height,
    sky,
    ground,
    targets: points.map(([x, y]) => ({ x: x / width, y: y / height })),
  };
}

export const CITIES: readonly City[] = [
  city("harbor", "海港", 1223, 1286, "#37aafe", "#efbaa3", [
    [210, 780],
    [490, 540],
    [1020, 690],
    [1010, 330],
  ]),
  city("park", "花園", 941, 1672, "#20a4fd", "#f0c2a5", [
    [220, 975],
    [270, 610],
    [755, 760],
    [790, 380],
  ]),
  city("downtown", "市中心", 1122, 1402, "#3db3fd", "#d7965c", [
    [270, 830],
    [520, 560],
    [880, 780],
    [970, 340],
  ]),
];

export const SHIELD_ART = "/art/shield-block.jpg";
