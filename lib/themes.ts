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
  /** Outer space instead of the sea (Sky 2026-10-02): `space.webp` behind the island, meteors and comets, no boat or gulls. */
  space?: boolean;
  /** Painted island (Sky 2026-10-02): `top.webp` (round floor seen from above) and `side.webp` (the rock
   *  underneath, sky cut away) instead of the plain white island. */
  island?: boolean;
  /** How far the painted rock hangs below the floor (default 3.8). */
  islandDepth?: number;
  /** Colour of the solid rock core seen between the hanging bits. */
  islandCore?: number;
  /** Colour of the floor's edge and the dragon's stone in the middle. */
  islandTrim?: number;
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

/** 水晶星 (Sky 2026-10-02): the first page, now in outer space like the rest of the game — crystal buildings
 *  on a floating island in a blue-violet nebula. Replaces 希臘 in the same place, so saves keep their levels. */
export const CRYSTAL: Theme = {
  id: "crystal",
  name: "水晶星",
  style: "art",
  ground: 0xe4def4,
  rock: 0x7f78a6,
  wall: 0xf4f1ff,
  roof: 0x5b4bc4,
  trim: 0xd4a72c,
  sky: "#3b2f9f",
  art: {
    dir: "/art/city/crystal",
    names: ["house", "mine", "observatory", "tower", "palace"],
    space: true,
    island: true,
    islandCore: 0x4a4266,
    islandTrim: 0xa99ad6,
    boatAspect: 1,
    gullAspect: 1,
    sizes: {
      house: [[93, 122], [136, 168], [173, 230], [245, 292], [300, 381]],
      mine: [[140, 117], [186, 179], [214, 242], [281, 289], [300, 450]],
      observatory: [[94, 98], [130, 154], [179, 268], [242, 360], [300, 474]],
      tower: [[98, 173], [132, 270], [171, 379], [189, 460], [255, 560]],
      palace: [[143, 180], [194, 235], [218, 346], [259, 425], [300, 515]],
    },
  },
};
/** 機械星 (Sky 2026-10-02): the second page, in 威尼斯's place — brass, gears and steam in an orange-copper nebula. */
export const MECH: Theme = {
  id: "mech",
  name: "機械星",
  style: "art",
  ground: 0xe8dccb,
  rock: 0x6b5a4c,
  wall: 0xf3e6d2,
  roof: 0x23345e,
  trim: 0xd48a2c,
  sky: "#c2602a",
  art: {
    dir: "/art/city/mech",
    names: ["house", "factory", "steam", "power", "clock"],
    space: true,
    island: true,
    islandDepth: 3.6,
    islandCore: 0x3a2716,
    islandTrim: 0x8a5a2b,
    boatAspect: 1,
    gullAspect: 1,
    sizes: {
      house: [[132, 154], [222, 219], [244, 320], [288, 433], [298, 560]],
      factory: [[104, 98], [174, 140], [229, 232], [262, 309], [300, 454]],
      steam: [[116, 143], [181, 248], [182, 404], [197, 492], [241, 560]],
      power: [[100, 115], [177, 183], [218, 246], [253, 382], [300, 546]],
      clock: [[56, 139], [162, 156], [203, 282], [240, 383], [300, 523]],
    },
  },
};
/** 糖果星 (Sky 2026-10-02): the third page, in 夏威夷's place — sweets and cakes in a pink cotton-candy nebula. */
export const CANDY: Theme = {
  id: "candy",
  name: "糖果星",
  style: "art",
  ground: 0xf6e3ea,
  rock: 0x8a5a4a,
  wall: 0xfff2f6,
  roof: 0xe86aa0,
  trim: 0xd4a72c,
  sky: "#e07ab8",
  art: {
    dir: "/art/city/candy",
    names: ["house", "icecream", "choc", "bakery", "castle"],
    space: true,
    island: true,
    islandDepth: 3.6,
    islandCore: 0x3b2216,
    islandTrim: 0xd9a46a,
    boatAspect: 1,
    gullAspect: 1,
    sizes: {
      house: [[132, 142], [203, 227], [219, 306], [257, 373], [300, 481]],
      icecream: [[126, 165], [192, 234], [207, 310], [221, 426], [281, 560]],
      choc: [[111, 111], [172, 198], [193, 256], [233, 337], [300, 522]],
      bakery: [[150, 160], [206, 226], [226, 277], [259, 394], [300, 560]],
      castle: [[119, 132], [176, 187], [207, 260], [251, 351], [300, 534]],
    },
  },
};
/** 冰晶星 (Sky 2026-10-02): the fourth page, in 江南's place — an ice house, penguin and dragon ice sculptures, a
 *  skating rink and an ice castle in an icy blue nebula. */
export const ICE: Theme = {
  id: "ice",
  name: "冰晶星",
  style: "art",
  ground: 0xe6eefa,
  rock: 0x6f86b0,
  wall: 0xf4f8ff,
  roof: 0x7aa7e8,
  trim: 0xd4a72c,
  sky: "#4a74d8",
  art: {
    dir: "/art/city/ice",
    names: ["house", "penguin", "rink", "dragon", "castle"],
    space: true,
    island: true,
    islandDepth: 3.4,
    islandCore: 0x2c4f7a,
    islandTrim: 0xbfdcf2,
    boatAspect: 1,
    gullAspect: 1,
    sizes: {
      house: [[120, 105], [175, 168], [216, 264], [249, 382], [300, 452]],
      penguin: [[106, 114], [158, 177], [200, 228], [238, 316], [300, 454]],
      rink: [[135, 102], [170, 123], [216, 196], [243, 252], [300, 360]],
      dragon: [[123, 106], [145, 155], [163, 186], [209, 243], [300, 328]],
      castle: [[158, 171], [200, 231], [216, 306], [260, 405], [296, 560]],
    },
  },
};
/** 熔岩星 (Sky 2026-10-02): the fifth page, in 杜拜's place — volcanic stone, lava, fire and a phoenix statue in a
 *  red-orange nebula. */
export const LAVA: Theme = {
  id: "lava",
  name: "熔岩星",
  style: "art",
  ground: 0xe9ddd6,
  rock: 0x4a3a3a,
  wall: 0xf3e3dc,
  roof: 0x3a2a2a,
  trim: 0xd4a72c,
  sky: "#c2361e",
  art: {
    dir: "/art/city/lava",
    names: ["house", "forge", "phoenix", "spa", "temple"],
    space: true,
    island: true,
    islandDepth: 3.6,
    islandCore: 0x2a1410,
    islandTrim: 0x5a2e1c,
    boatAspect: 1,
    gullAspect: 1,
    sizes: {
      house: [[113, 108], [161, 181], [198, 265], [266, 340], [300, 419]],
      forge: [[109, 90], [164, 174], [212, 229], [274, 297], [300, 389]],
      phoenix: [[105, 129], [113, 173], [141, 228], [213, 304], [300, 428]],
      spa: [[96, 65], [124, 93], [208, 178], [212, 200], [300, 263]],
      temple: [[108, 104], [160, 153], [187, 221], [262, 271], [300, 356]],
    },
  },
};
/** 霓虹未來城 (Sky 2026-10-02): the sixth page, in 維多利亞港's place — capsule homes, a sky port, a rocket pad, a neon
 *  ferris wheel (in memory of the harbour's wheel) and a space elevator in a neon-lit navy nebula. */
export const NEON: Theme = {
  id: "neon",
  name: "霓虹未來城",
  style: "art",
  ground: 0xe6e6f4,
  rock: 0x3a3f7a,
  wall: 0xf6f4ff,
  roof: 0x2a2f6a,
  trim: 0xff5fd2,
  sky: "#3a2fa0",
  art: {
    dir: "/art/city/neon",
    names: ["house", "port", "rocket", "wheel", "elevator"],
    space: true,
    boatAspect: 1,
    gullAspect: 1,
    sizes: {
      house: [[128, 153], [165, 246], [183, 329], [205, 468], [267, 560]],
      port: [[137, 75], [233, 185], [227, 239], [252, 378], [300, 543]],
      rocket: [[123, 95], [167, 168], [217, 271], [281, 379], [300, 544]],
      wheel: [[92, 118], [150, 187], [172, 239], [242, 319], [300, 412]],
      elevator: [[131, 115], [141, 201], [153, 366], [173, 496], [216, 560]],
    },
  },
};
/** 希臘藍白海岸 (no longer in the list): the old first page, drawn from pictures (also shown on any page with the preview link ?city=greece). */
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
/** 杜拜海灣: the fifth page, with a dhow (the gull is Greece's). */
export const DUBAI: Theme = {
  id: "dubai",
  name: "杜拜海灣",
  style: "art",
  ground: 0xf2e6cf,
  rock: 0xc3a57a,
  wall: 0xf5e6c8,
  roof: 0xd9a441,
  trim: 0x1fa6c9,
  sky: "#e9a64a",
  art: {
    dir: "/art/city/dubai",
    names: ["house", "souk", "tower", "yacht", "palace"],
    boatV: -0.19,
    boatAspect: 320 / 179,
    gullAspect: 256 / 192,
    boatSize: 0.11,
    sizes: {
      house: [[155, 99], [152, 160], [157, 227], [190, 261], [300, 350]],
      souk: [[157, 146], [166, 223], [266, 245], [276, 310], [300, 434]],
      tower: [[209, 231], [194, 282], [161, 420], [174, 489], [172, 560]],
      yacht: [[118, 106], [158, 135], [194, 206], [250, 272], [300, 394]],
      palace: [[199, 149], [200, 179], [205, 208], [218, 269], [300, 403]],
    },
  },
};
/** 維多利亞港: the sixth page, at night, with the Star Ferry (the gull is Greece's). */
export const VICTORIA: Theme = {
  id: "victoria",
  name: "維多利亞港",
  style: "art",
  ground: 0xe6e1d8,
  rock: 0x8f8a84,
  wall: 0xefe6d6,
  roof: 0x2f6b4f,
  trim: 0xff5fa2,
  sky: "#3a3a9a",
  art: {
    dir: "/art/city/victoria",
    names: ["tong", "tram", "pier", "tower", "wheel"],
    boatV: -0.2,
    boatAspect: 320 / 143,
    gullAspect: 256 / 192,
    boatSize: 0.13,
    sizes: {
      tong: [[216, 178], [171, 288], [188, 398], [221, 454], [236, 560]],
      tram: [[126, 78], [169, 219], [190, 233], [256, 254], [300, 363]],
      pier: [[105, 115], [139, 140], [180, 170], [227, 227], [300, 280]],
      tower: [[201, 185], [171, 223], [174, 353], [200, 492], [198, 560]],
      wheel: [[138, 92], [161, 186], [175, 296], [223, 355], [300, 493]],
    },
  },
};

export const THEMES: readonly Theme[] = [
  // Sky (2026-09-28): only the seaside pages — 工地小鎮, 清朝古鎮 and 沙漠綠洲 are gone. More follow.
  // Sky (2026-10-02): the pages move into outer space one by one, starting with 水晶星 in 希臘's place.
  CRYSTAL,
  MECH,
  CANDY,
  ICE,
  LAVA,
  NEON,
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
