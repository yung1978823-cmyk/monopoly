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
  /** Width ÷ height of the page's boat.webp and gull.webp (the bird picture). */
  boatAspect: number;
  gullAspect: number;
  /** How wide the boat is, as a share of the sea picture's width. */
  boatSize?: number;
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
    boatAspect: 256 / 250,
    gullAspect: 256 / 192,
    spin: { name: "mill", url: "/art/city/greece/blades.webp", at: [[0.78, 0.49, 250], [0.783, 0.532, 250]] },
  },
};
/** 威尼斯水城: the third page (in place of 沙漠綠洲), with a gondola and pigeons. */
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
    boatAspect: 320 / 152,
    gullAspect: 320 / 317,
    boatSize: 0.11,
    sizes: {
      house: [[140, 146], [178, 184], [197, 289], [212, 380], [265, 560]],
      tower: [[156, 103], [153, 186], [152, 303], [152, 408], [151, 560]],
      palace: [[181, 102], [207, 196], [216, 295], [246, 389], [286, 560]],
      glass: [[118, 128], [183, 135], [213, 299], [229, 332], [300, 397]],
      dock: [[80, 124], [103, 139], [171, 212], [207, 248], [300, 364]],
    },
  },
};
/** 夏威夷海灘: the fourth page, with an outrigger canoe (the gull is Greece's). */
export const HAWAII: Theme = {
  id: "hawaii",
  name: "夏威夷海灘",
  style: "art",
  ground: 0xf1e2bf,
  rock: 0xa98c66,
  wall: 0xf7f1e3,
  roof: 0xd9a441,
  trim: 0x1fa6c9,
  sky: "#2fc0e8",
  art: {
    dir: "/art/city/hawaii",
    names: ["hut", "surf", "tower", "tiki", "resort"],
    boatV: -0.2,
    boatAspect: 320 / 175,
    gullAspect: 256 / 192,
    boatSize: 0.1,
    sizes: {
      hut: [[117, 110], [140, 172], [176, 200], [234, 249], [300, 363]],
      surf: [[94, 127], [141, 170], [194, 203], [258, 244], [300, 408]],
      tower: [[169, 223], [219, 257], [237, 331], [244, 414], [300, 487]],
      tiki: [[172, 130], [172, 204], [173, 222], [180, 223], [300, 359]],
      resort: [[157, 100], [151, 151], [193, 196], [212, 255], [300, 408]],
    },
  },
};
/** 江南水鄉: the fourth page, with a covered wupeng boat and swallows. */
export const JIANGNAN: Theme = {
  id: "jiangnan",
  name: "江南水鄉",
  style: "art",
  ground: 0xe9e6de,
  rock: 0x8f969c,
  wall: 0xf4f1ea,
  roof: 0x3b3f46,
  trim: 0xc0392b,
  sky: "#3fb8a6",
  art: {
    dir: "/art/city/jiangnan",
    names: ["house", "tea", "pagoda", "garden", "dye"],
    boatV: -0.19,
    boatAspect: 320 / 106,
    gullAspect: 320 / 235,
    boatSize: 0.12,
    sizes: {
      house: [[135, 84], [139, 146], [156, 170], [209, 248], [300, 355]],
      tea: [[123, 94], [191, 184], [255, 279], [274, 391], [300, 554]],
      pagoda: [[163, 129], [174, 195], [182, 333], [183, 454], [212, 560]],
      garden: [[114, 82], [128, 88], [158, 209], [201, 277], [300, 350]],
      dye: [[130, 106], [137, 179], [214, 227], [264, 278], [300, 349]],
    },
  },
};
export const THEMES: readonly Theme[] = [
  // Sky (2026-09-28): only the seaside pages — 工地小鎮, 清朝古鎮 and 沙漠綠洲 are gone. More follow.
  GREECE,
  VENICE,
  HAWAII,
  JIANGNAN,
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
