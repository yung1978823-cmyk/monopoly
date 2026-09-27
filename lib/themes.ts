/**
 * The themes (pages) of a town, in order. Everyone starts on the first; raising all five buildings
 * to level 5 finishes the page, locks it (it can't be attacked any more, only looked at) and opens
 * the next. A rival is attacked on whichever page they are on now.
 */
export type ThemeStyle = "site" | "oriental" | "desert";

export type Theme = {
  id: string;
  name: string;
  style: ThemeStyle;
  /** Island top, rock, walls, roofs and a trim colour for the buildings. */
  ground: number;
  rock: number;
  wall: number;
  roof: number;
  trim: number;
  /** Background glow of the sky around the island. */
  sky: string;
};

export const THEMES: readonly Theme[] = [
  { id: "site", name: "工地小鎮", style: "site", ground: 0x6aa84f, rock: 0x7a6a5a, wall: 0xf2e8d5, roof: 0xe8792b, trim: 0xfbd000, sky: "#4d7fc0" },
  { id: "oriental", name: "清朝古鎮", style: "oriental", ground: 0x5f9e57, rock: 0x6b6f78, wall: 0xf1e3c8, roof: 0x2f5d8a, trim: 0xc0392b, sky: "#5a78b5" },
  { id: "desert", name: "沙漠綠洲", style: "desert", ground: 0xe8c77e, rock: 0xb08556, wall: 0xf3dcae, roof: 0xd9a441, trim: 0x2aa6a0, sky: "#c98a58" },
];

export function themeOf(index: number): Theme {
  return THEMES[Math.max(0, Math.min(THEMES.length - 1, index))];
}
