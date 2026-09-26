/**
 * A rival's city: the art shown when you land on 攻擊, and its empty building plots.
 * Each plot holds one of the rival's landmarks, so a city with fewer plots has fewer
 * landmarks to attack.
 */
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
  /** Stand-in for a built landmark until the 3D building renders are drawn. */
  building: string;
  /** Centre of each plot as fractions of the art; plot i holds landmark slot i. */
  plots: readonly { x: number; y: number }[];
  /** Who lives here: shown as a framed face and name at the top of the attack screen. */
  rival: { name: string; avatar: string };
};

const WIDTH = 1600;
const HEIGHT = 2848;

function city(
  id: string,
  name: string,
  sky: string,
  ground: string,
  building: string,
  points: readonly [number, number][],
  rival: { name: string; avatar: string },
): City {
  return {
    id,
    name,
    art: `/art/city-${id}.jpg`,
    width: WIDTH,
    height: HEIGHT,
    sky,
    ground,
    building,
    plots: points.map(([x, y]) => ({ x: x / WIDTH, y: y / HEIGHT })),
    rival,
  };
}

export const CITIES: readonly City[] = [
  city("jiangshi", "清朝古鎮", "#3da6d5", "#f5ddbb", "🏯", [
    [470, 2221],
    [1367, 1402],
    [1025, 854],
  ], { name: "阿殭", avatar: "/art/avatars/jiangshi.jpg" }),
  city("mummy", "沙漠綠洲", "#3596cb", "#ffdb8f", "🏛️", [
    [363, 2050],
    [1231, 2050],
  ], { name: "阿木", avatar: "/art/avatars/mummy.jpg" }),
  city("zombie", "工地小鎮", "#4eaddd", "#a48e80", "🏠", [
    [448, 2014],
    [313, 1431],
    [1210, 1772],
  ], { name: "阿強", avatar: "/art/avatars/zombie.jpg" }),
];

/** How many landmarks a rival in this city can have. */
export function plotCount(cityIndex: number): number {
  return (CITIES[cityIndex] ?? CITIES[0]).plots.length;
}

export const SHIELD_ART = "/art/shield-block.jpg";
