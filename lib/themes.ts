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
  /** Turning sails on one building's level 4 and 5 pictures: [across, down, width in picture pixels]. */
  spin?: { name: string; url: string; at: readonly (readonly [number, number, number])[] };
  /** How far down the sea picture the boat sails (-0.5 top … 0.5 bottom); open water differs per picture. */
  boatV?: number;
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

/** 希臘藍白海岸: the second page, drawn from pictures (also shown on any page with the preview link ?city=greece). */
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
      mill: [[213, 166], [214, 274], [226, 368], [227, 370], [230, 560]],
      church: [[199, 155], [212, 213], [220, 273], [254, 308], [300, 401]],
      tavern: [[132, 130], [169, 182], [192, 213], [220, 266], [300, 377]],
      light: [[198, 172], [193, 231], [203, 334], [225, 425], [300, 500]],
    },
    lamp: { name: "light", at: [[0.49, 0.22], [0.54, 0.2]] },
    spin: { name: "mill", url: "/art/city/greece/blades.webp", at: [[0.78, 0.49, 250], [0.783, 0.532, 250]] },
  },
};
/** 威尼斯水城: the third page (in place of 沙漠綠洲). The boat and gull are Greece's until Sky's gondola and pigeon come. */
export const VENICE: Theme = {
  id: "venice",
  name: "威尼斯水城",
  style: "art",
  ground: 0xeadfcf,
  rock: 0xb39a7c,
  wall: 0xf2d27a,
  roof: 0xd8643a,
  trim: 0x2f6fd0,
  sky: "#35b3d6",
  art: {
    dir: "/art/city/venice",
    names: ["house", "tower", "palace", "glass", "dock"],
    boatV: -0.19,
    sizes: {
      house: [[140, 146], [178, 184], [197, 289], [212, 380], [265, 560]],
      tower: [[156, 103], [153, 186], [152, 303], [152, 408], [151, 560]],
      palace: [[181, 102], [207, 196], [216, 295], [246, 389], [286, 560]],
      glass: [[118, 128], [183, 135], [213, 299], [229, 332], [300, 397]],
      dock: [[80, 124], [103, 139], [171, 212], [207, 248], [300, 364]],
    },
  },
};
export const THEMES: readonly Theme[] = [
  { id: "site", name: "工地小鎮", style: "site", ground: 0x6aa84f, rock: 0x7a6a5a, wall: 0xf2e8d5, roof: 0xe8792b, trim: 0xfbd000, sky: "#4d7fc0" },
  // The seaside pages take the places of the old 清朝古鎮 and 沙漠綠洲; more follow.
  GREECE,
  VENICE,
];

/** The page asked for in a preview link (?city=greece, ?city=venice …) as a page number, or null. Browser only. */
export function previewTheme(): number | null {
  try {
    const id = new URLSearchParams(window.location.search).get("city");
    const i = THEMES.findIndex((theme) => theme.id === id);
    return i >= 0 ? i : null;
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
  return THEMES[Math.max(0, Math.min(THEMES.length - 1, index))];
}
