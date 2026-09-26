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
  // 領地
  "{name} 交租 {n} 俾主人": { hans: "{name} 付 {n} 租金给主人", en: "{name} pays the host {n} rent" },
  "🏰 主人收入": { hans: "🏰 主人收入", en: "🏰 Host earnings" },
  "免費場：分數局，冇門票": { hans: "免费场：分数局，没有门票", en: "Free game: points only, no tickets" },
  "門票 {n} × {g} 位客": { hans: "门票 {n} × {g} 位客人", en: "Tickets {n} × {g} guests" },
  "公司抽成（臨時 10%）": { hans: "公司抽成（临时 10%）", en: "House cut (temporary 10%)" },
  租金屋收租: { hans: "租金屋收租", en: "Rent houses collected" },
  呢一局淨收: { hans: "这一局净收入", en: "Net this game" },
  "{n} 張枱坐滿，每輪大約": { hans: "{n} 张桌坐满，每轮大约", en: "With {n} full tables, per round about" },
  領地: { hans: "领地", en: "Realm" },
  我嘅領地: { hans: "我的领地", en: "My realm" },
  "🏰 我嘅領地": { hans: "🏰 我的领地", en: "🏰 My realm" },
  練習版: { hans: "练习版", en: "Practice" },
  規模: { hans: "规模", en: "Size" },
  小: { hans: "小", en: "Small" },
  中: { hans: "中", en: "Medium" },
  大: { hans: "大", en: "Large" },
  "{t} 枱 · {s} 個建造位": { hans: "{t} 桌 · {s} 个建造位", en: "{t} tables · {s} slots" },
  門面: { hans: "门面", en: "Facade" },
  加枱: { hans: "加桌", en: "Extra table" },
  租金屋: { hans: "租金屋", en: "Rent house" },
  車站: { hans: "车站", en: "Station" },
  機會屋: { hans: "机会屋", en: "Chance house" },
  "拆咗{b}": { hans: "拆掉{b}", en: "Remove {b}" },
  "喺第 {n} 個位起嘢": { hans: "在第 {n} 个位建造", en: "Build in slot {n}" },
  "同時開 {n} 張枱": { hans: "同时开 {n} 张桌", en: "{n} tables at once" },
  "每人 {n} 轉": { hans: "每人 {n} 轮", en: "{n} turns each" },
  "總造價 {n}（臨時）": { hans: "总造价 {n}（临时）", en: "Build cost {n} (temporary)" },
  機會卡: { hans: "机会卡", en: "Chance cards" },
  標準: { hans: "标准", en: "Standard" },
  大起大落: { hans: "大起大落", en: "Wild" },
  平穩: { hans: "平稳", en: "Calm" },
  門票減一: { hans: "门票减一", en: "Ticket −1" },
  門票加一: { hans: "门票加一", en: "Ticket +1" },
  "0 = 免費場，分數局": { hans: "0 = 免费场，分数局", en: "0 = free game, points only" },
  "最多 {n}，同公開桌入場一樣": { hans: "最多 {n}，和公开桌入场一样", en: "Up to {n}, the same as the public table entry" },
  "開局招待（電腦做客人）": { hans: "开局招待（电脑当客人）", en: "Host a game (computer guests)" },
  "只改外觀：金色屋頂": { hans: "只改外观：金色屋顶", en: "Looks only: gold roofs" },
  同時多開一張枱: { hans: "同时多开一张桌", en: "Run one more table at once" },
  "客人踩中要交租俾你（{n}）": { hans: "客人踩中要付租金给你（{n}）", en: "Guests who land here pay you rent ({n})" },
  "每人少 {n} 轉，打得快啲": { hans: "每人少 {n} 轮，打得更快", en: "{n} fewer turns each, faster games" },
  揀用邊套機會卡: { hans: "选择用哪套机会卡", en: "Choose the chance deck" },
  已經到上限: { hans: "已经到上限", en: "At the limit" },
  "臨時 {n}": { hans: "临时 {n}", en: "Temp {n}" },
  "中大獎 +4": { hans: "中大奖 +4", en: "Big prize +4" },
  "俾人呃咗 −4": { hans: "被骗了 −4", en: "Scammed −4" },
  "賣舊嘢 +1": { hans: "卖旧东西 +1", en: "Sold old stuff +1" },
  "交電費 −1": { hans: "交电费 −1", en: "Electric bill −1" },
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
