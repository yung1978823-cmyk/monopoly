/**
 * The themes (pages) of a town, in order. Everyone starts on the first; raising all five buildings
 * to level 5 finishes the page, locks it (it can't be attacked any more, only looked at) and opens
 * the next. A rival is attacked on whichever page they are on now.
 */
export type ThemeStyle = "site" | "oriental" | "desert" | "art";

/** A theme drawn from pictures: a sea wallpaper behind the island and five buildings, five levels each. */
export type ThemeArt = {
  /** Folder under /public holding `<name><level>.webp` and `sea.webp`. */
  dir: string;
  /** The five buildings, in plot order. */
  names: readonly string[];
  /** Picture sizes in pixels, [building][level-1] = [w, h] (level 5 is 300 wide). */
  sizes: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  /** Where the lighthouse lamp is on its level 4 and 5 pictures (0…1 across, down), if it has one. */
  lamp?: { name: string; at: readonly (readonly [number, number])[] };
};

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
  art?: ThemeArt;
};

export const THEMES: readonly Theme[] = [
  { id: "site", name: "工地小鎮", style: "site", ground: 0x6aa84f, rock: 0x7a6a5a, wall: 0xf2e8d5, roof: 0xe8792b, trim: 0xfbd000, sky: "#4d7fc0" },
  { id: "oriental", name: "清朝古鎮", style: "oriental", ground: 0x5f9e57, rock: 0x6b6f78, wall: 0xf1e3c8, roof: 0x2f5d8a, trim: 0xc0392b, sky: "#5a78b5" },
  { id: "desert", name: "沙漠綠洲", style: "desert", ground: 0xe8c77e, rock: 0xb08556, wall: 0xf3dcae, roof: 0xd9a441, trim: 0x2aa6a0, sky: "#c98a58" },
];

/** 希臘藍白海岸: a picture-drawn page, only seen through the preview link for now (?city=greece). */
export const GREECE: Theme = {
  id: "greece",
  name: "希臘藍白海岸",
  style: "art",
  ground: 0xeee7da,
  rock: 0xb9a98f,
  wall: 0xffffff,
  roof: 0x2f6fd0,
  trim: 0x2f6fd0,
  sky: "#3aa0e6",
  art: {
    dir: "/art/city/greece",
    names: ["house", "mill", "church", "tavern", "light"],
    sizes: {
      house: [[130, 139], [145, 149], [204, 243], [223, 265], [300, 441]],
      mill: [[181, 114], [204, 244], [209, 332], [290, 423], [300, 479]],
      church: [[199, 155], [212, 213], [220, 273], [254, 308], [300, 401]],
      tavern: [[132, 130], [169, 182], [192, 213], [220, 266], [300, 377]],
      light: [[198, 172], [193, 231], [203, 334], [225, 425], [300, 500]],
    },
    lamp: { name: "light", at: [[0.49, 0.22], [0.54, 0.2]] },
  },
};
/** The theme number that stands for the preview page. */
export const PREVIEW_GREECE = 99;

/** The preview page asked for in the link (?city=greece), or null. Call only in the browser. */
export function previewTheme(): number | null {
  try {
    return new URLSearchParams(window.location.search).get("city") === "greece" ? PREVIEW_GREECE : null;
  } catch {
    return null;
  }
}

/** The picture of building `building` at `level` on a picture page (level 0 shows level 1), or null. */
export function artPicture(theme: Theme, building: number, level: number): string | null {
  if (!theme.art) return null;
  return `${theme.art.dir}/${theme.art.names[building]}${Math.max(1, Math.min(5, level))}.webp`;
}

export function themeOf(index: number): Theme {
  if (index === PREVIEW_GREECE) return GREECE;
  return THEMES[Math.max(0, Math.min(THEMES.length - 1, index))];
}
