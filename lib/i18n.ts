/**
 * Three languages: 繁體中文 (the source text, written in Cantonese), 简体中文 and English.
 *
 * Every piece of text on screen is written in Traditional Chinese in the code and passed through
 * `translate`; the dictionary below gives its Simplified and English versions. Placeholders like
 * {name} are filled in from `vars`. The choice is remembered on this device.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Lang = "hant" | "hans" | "en";
export const LANGS: readonly { id: Lang; label: string; html: string }[] = [
  { id: "hant", label: "繁", html: "zh-Hant" },
  { id: "hans", label: "简", html: "zh-Hans" },
  { id: "en", label: "EN", html: "en" },
];

const DICT: Record<string, { hans: string; en: string }> = {
  // People and places
  你: { hans: "你", en: "You" },
  阿殭: { hans: "阿僵", en: "Jiang" },
  阿木: { hans: "阿木", en: "Mo" },
  阿強: { hans: "阿强", en: "Keung" },
  清朝古鎮: { hans: "清朝古镇", en: "Qing Town" },
  沙漠綠洲: { hans: "沙漠绿洲", en: "Desert Oasis" },
  工地小鎮: { hans: "工地小镇", en: "Building Site Town" },
  一號樓: { hans: "一号楼", en: "Tower 1" },
  二號樓: { hans: "二号楼", en: "Tower 2" },
  三號樓: { hans: "三号楼", en: "Tower 3" },
  // Daily board squares
  起點: { hans: "起点", en: "Start" },
  金幣: { hans: "金币", en: "Coins" },
  寶箱: { hans: "宝箱", en: "Chest" },
  幸運骰: { hans: "幸运骰", en: "Lucky Die" },
  攻擊: { hans: "攻击", en: "Attack" },
  監獄: { hans: "监狱", en: "Jail" },
  稅局: { hans: "税局", en: "Tax Office" },
  // Daily board screen
  你的每日棋盤: { hans: "你的每日棋盘", en: "Your daily board" },
  "拎走 NFT {n}": { hans: "拿走 NFT {n}", en: "Remove NFT {n}" },
  "放 NFT 入第 {n} 格": { hans: "把 NFT 放入第 {n} 格", en: "Put an NFT in slot {n}" },
  "存檔讀不出來，已改用一塊新棋盤。": { hans: "存档读取失败，已改用新棋盘。", en: "Couldn't read your save, so this is a new board." },
  "這台瀏覽器沒把棋盤存下來。重新整理會回到新棋盤。": {
    hans: "这个浏览器没有保存棋盘。刷新后会回到新棋盘。",
    en: "This browser didn't save your board. Reloading will start a new one.",
  },
  公開桌: { hans: "公开桌", en: "Public Table" },
  設定: { hans: "设置", en: "Settings" },
  你個城: { hans: "你的城", en: "Your city" },
  擲骰: { hans: "掷骰", en: "Roll" },
  開聲: { hans: "开声音", en: "Sound on" },
  靜音: { hans: "静音", en: "Mute" },
  關閉: { hans: "关闭", en: "Close" },
  語言: { hans: "语言", en: "Language" },
  "補一粒（測試）": { hans: "补一颗（测试）", en: "Add a die (test)" },
  "被攻擊（測試）": { hans: "被攻击（测试）", en: "Get attacked (test)" },
  "對手 NFT：{v}（測試）": { hans: "对手 NFT：{v}（测试）", en: "Rival NFT: {v} (test)" },
  有: { hans: "有", en: "yes" },
  冇: { hans: "无", en: "no" },
  "確定重開？": { hans: "确定重开？", en: "Really restart?" },
  重開棋盤: { hans: "重开棋盘", en: "Restart board" },
  "第 {n} 級": { hans: "第 {n} 级", en: "Level {n}" },
  未擲: { hans: "未掷", en: "–" },
  骰子轉動中: { hans: "骰子转动中", en: "Dice rolling" },
  "骰子 {n}": { hans: "骰子 {n}", en: "Die {n}" },
  // Title
  "吸血鬼、中國殭屍、木乃伊同殭屍喺大棋盤上衝出嚟": {
    hans: "吸血鬼、中国僵尸、木乃伊和丧尸从大棋盘上冲出来",
    en: "A vampire, a jiangshi, a mummy and a zombie burst out of a giant board",
  },
  "載入中 {n}%": { hans: "载入中 {n}%", en: "Loading {n}%" },
  // Your city
  "{b}，第 {n} 級": { hans: "{b}，第 {n} 级", en: "{b}, level {n}" },
  "{b}已經最高級": { hans: "{b}已经最高级", en: "{b} is at the top level" },
  "修返{b}，要 {n} 金幣": { hans: "修复{b}，要 {n} 金币", en: "Repair {b} for {n} coins" },
  "升級{b}，要 {n} 金幣": { hans: "升级{b}，要 {n} 金币", en: "Upgrade {b} for {n} coins" },
  返回棋盤: { hans: "返回棋盘", en: "Back to board" },
  // Attack
  "{b}跌咗一級！": { hans: "{b}降了一级！", en: "{b} dropped a level!" },
  "打中！": { hans: "打中！", en: "Hit!" },
  "打唔中……": { hans: "没打中……", en: "Missed…" },
  打唔中: { hans: "没打中", en: "Missed" },
  "撳一座建築 🔨": { hans: "点一座建筑 🔨", en: "Tap a building 🔨" },
  "一座建築都冇，直接打！": { hans: "一座建筑都没有，直接打！", en: "No buildings, just hit!" },
  "攻擊{b}": { hans: "攻击{b}", en: "Attack {b}" },
  "搬走 {n} DST": { hans: "搬走 {n} DST", en: "Took {n} DST" },
  "🔨 攻擊": { hans: "🔨 攻击", en: "🔨 Attack" },
  "💥 跌一級！": { hans: "💥 降一级！", en: "💥 Down a level!" },
  // Public table
  返回: { hans: "返回", en: "Back" },
  入場: { hans: "入场", en: "Entry" },
  門票: { hans: "门票", en: "Ticket" },
  落場: { hans: "上桌", en: "Stake" },
  "練習局：用分數代替 DST，打完清零": { hans: "练习局：用分数代替 DST，结束后清零", en: "Practice game: points stand in for DST and reset afterwards" },
  "{n} 人枱": { hans: "{n} 人桌", en: "{n}-player table" },
  開枱: { hans: "开桌", en: "Start" },
  "輪到 {name}": { hans: "轮到 {name}", en: "{name}'s turn" },
  "{name} 付 {n} 保釋出獄": { hans: "{name} 付 {n} 保释出狱", en: "{name} pays {n} bail" },
  "經過起點 +{n}": { hans: "经过起点 +{n}", en: "Passed Start +{n}" },
  "{name} 喺分岔路口": { hans: "{name} 在岔路口", en: "{name} is at a fork" },
  揀路: { hans: "选路", en: "Pick a way" },
  "{name} 買地起樓 −{n}": { hans: "{name} 买地盖楼 −{n}", en: "{name} buys and builds −{n}" },
  "{name} 起咗地標！": { hans: "{name} 盖了地标！", en: "{name} built a landmark!" },
  "{name} 升到第 {n} 級": { hans: "{name} 升到第 {n} 级", en: "{name} upgrades to level {n}" },
  "{name} 交租 {n} 俾 {owner}": { hans: "{name} 付 {n} 租金给 {owner}", en: "{name} pays {owner} {n} rent" },
  "{name} 開寶箱 +{n}": { hans: "{name} 开宝箱 +{n}", en: "{name} opens a chest +{n}" },
  "{name} 十字路口 +{n}": { hans: "{name} 十字路口 +{n}", en: "{name} at the crossroads +{n}" },
  "{name} 交稅 −{n}": { hans: "{name} 交税 −{n}", en: "{name} pays tax −{n}" },
  "{name} 坐飛機！": { hans: "{name} 坐飞机！", en: "{name} takes a plane!" },
  "{name} 入獄！": { hans: "{name} 入狱！", en: "{name} goes to jail!" },
  "{name} 破產！": { hans: "{name} 破产！", en: "{name} is bankrupt!" },
  "擲出 {n}，孖寶！": { hans: "掷出 {n}，双数！", en: "Rolled {n}, doubles!" },
  "擲出 {n}": { hans: "掷出 {n}", en: "Rolled {n}" },
  "路邊執到錢 +2": { hans: "路边捡到钱 +2", en: "Found money +2" },
  "中小獎 +1": { hans: "中小奖 +1", en: "Small prize +1" },
  "跌咗錢 −1": { hans: "丢了钱 −1", en: "Lost money −1" },
  "整屋頂 −2": { hans: "修屋顶 −2", en: "Roof repair −2" },
  向前行三格: { hans: "向前走三格", en: "Move forward 3" },
  "俾人捉咗，入獄": { hans: "被抓了，入狱", en: "Caught! Go to jail" },
  兩個菱形砌成八字嘅立體棋盤: { hans: "两个菱形组成八字的立体棋盘", en: "3D figure-eight board of two diamonds" },
  "第 {n}／{total} 轉": { hans: "第 {n}／{total} 轮", en: "Turn {n}/{total}" },
  "載入立體棋盤⋯": { hans: "载入立体棋盘⋯", en: "Loading 3D board…" },
  "立體畫面載入唔到，請檢查網絡再試。": {
    hans: "立体画面载入失败，请检查网络再试。",
    en: "The 3D board couldn't load. Check your connection and try again.",
  },
  再試: { hans: "再试", en: "Retry" },
  "⟳ 行外圈": { hans: "⟳ 走外圈", en: "⟳ Outer loop" },
  "⇢ 抄內路": { hans: "⇢ 抄近路", en: "⇢ Shortcut" },
  "速度 {n} 倍，撳一下轉": { hans: "速度 {n} 倍，按一下切换", en: "Speed x{n}, tap to change" },
  睇全枱: { hans: "看全桌", en: "Whole board" },
  跟住睇: { hans: "跟随", en: "Follow" },
  "{n} 秒後自動擲骰": { hans: "{n} 秒后自动掷骰", en: "Auto roll in {n}s" },
  "🏆 結果": { hans: "🏆 结果", en: "🏆 Results" },
  "+{n} 分": { hans: "+{n} 分", en: "+{n} pts" },
  再嚟一局: { hans: "再来一局", en: "Play again" },
};

export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  const base = lang === "hant" ? text : (DICT[text]?.[lang] ?? text);
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

// ---------- The chosen language, shared by every screen ----------

const LANG_KEY = "boolionaire-lang";
const listeners = new Set<() => void>();
let current: Lang | null = null;

function guess(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "hant" || saved === "hans" || saved === "en") return saved;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  const browser = (typeof navigator !== "undefined" ? navigator.language : "").toLowerCase();
  if (browser.startsWith("zh")) return /cn|sg|hans/.test(browser) ? "hans" : "hant";
  if (browser && !browser.startsWith("zh")) return "en";
  return "hant";
}

export function getLang(): Lang {
  if (current === null) current = guess();
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Not remembered on this device; still switches now.
  }
  document.documentElement.lang = LANGS.find((item) => item.id === lang)?.html ?? "zh-Hant";
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current language and a `t` to translate with it; re-renders when the language changes. */
export function useLang(): { lang: Lang; t: (text: string, vars?: Record<string, string | number>) => string } {
  const lang = useSyncExternalStore(subscribe, getLang, () => "hant" as Lang);
  const t = useCallback((text: string, vars?: Record<string, string | number>) => translate(lang, text, vars), [lang]);
  useEffect(() => {
    document.documentElement.lang = LANGS.find((item) => item.id === lang)?.html ?? "zh-Hant";
  }, [lang]);
  return { lang, t };
}
