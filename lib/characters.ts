/** The four playable characters, shared by the daily board (第一層) and the public table (第二層). */
export const CHARACTERS = [
  { name: "伯爵", avatar: "/art/avatars/vampire.jpg", colour: "#7C3AED", actor: "vampire" },
  { name: "阿殭", avatar: "/art/avatars/jiangshi.jpg", colour: "#2563EB", actor: "jiangshi" },
  { name: "阿木", avatar: "/art/avatars/mummy.jpg", colour: "#D97706", actor: "mummy" },
  { name: "阿強", avatar: "/art/avatars/zombie.jpg", colour: "#16A34A", actor: "zombie" },
] as const;

const PICK_KEY = "boolionaire-character";

/** The character you last picked (伯爵 when nothing is saved). */
export function savedPick(): number {
  try {
    const n = Number(window.localStorage.getItem(PICK_KEY));
    return Number.isInteger(n) && n >= 0 && n < CHARACTERS.length ? n : 0;
  } catch {
    return 0;
  }
}

export function savePick(i: number) {
  try {
    window.localStorage.setItem(PICK_KEY, String(i));
  } catch {
    // Remembering the pick is only a convenience.
  }
}
