"use client";

import { juice } from "@/components/juice";
import { CityView } from "@/components/city-view";
import { LevelPips } from "@/components/building";
import { TipHand } from "@/components/tip-hand";
import { LANDMARK_NAMES } from "@/lib/board";
import { canUpgrade, holdsNft, isRepair, pageDone, upgradeCost, type GameState } from "@/lib/game";
import { MAX_LEVEL, THEME_REWARD_DICE, themeRewardCoins } from "@/lib/rules";
import { artPicture, previewTheme, themeOf, THEMES } from "@/lib/themes";
import { useLang } from "@/lib/i18n";
import { play } from "@/lib/sfx";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

const FULL = Array.from({ length: 5 }, () => MAX_LEVEL);

/**
 * Your town, one theme (page) at a time, as a floating island in 3D. Tap a plot (or its card below)
 * to raise it a level; knocked-down levels come back at half price. Five buildings at level 5 finish
 * the page: fireworks, a reward, and the next theme opens. Finished pages stay to look at (locked).
 */
export function MyCity({
  state,
  onUpgrade,
  onClose,
}: {
  state: GameState;
  onUpgrade: (building: number) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [page, setPage] = useState(state.theme);
  const [raised, setRaised] = useState<{ building: number; key: number } | null>(null);
  /** The page just finished (shown with fireworks until you move on). */
  const [finished, setFinished] = useState<number | null>(null);
  const [party, setParty] = useState(0);
  const seenTheme = useRef(state.theme);
  const seenDone = useRef(pageDone(state.levels));
  const firstTime = state.theme === 0 && state.levels.every((level) => level === 0);

  // A page was just finished: stay on it for the fireworks, then offer the next one.
  useEffect(() => {
    const done = pageDone(state.levels);
    if (state.theme > seenTheme.current || (done && !seenDone.current)) {
      const which = state.theme > seenTheme.current ? seenTheme.current : state.theme;
      const id = window.setTimeout(() => {
        setFinished(which);
        setPage(which);
        setParty((n) => n + 1);
        play("chest");
        juice("large");
      }, 0);
      seenTheme.current = state.theme;
      seenDone.current = done;
      return () => window.clearTimeout(id);
    }
    seenTheme.current = state.theme;
    seenDone.current = done;
  }, [state.theme, state.levels]);

  /** The preview page from the link (?city=greece), found after the page loads. */
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setPreview(previewTheme()), 0);
    return () => window.clearTimeout(id);
  }, []);
  const shown = themeOf(preview ?? page);

  const current = page === state.theme && finished === null;
  const levels = current ? state.levels : FULL;

  function raise(building: number) {
    if (!current || !canUpgrade(state, building)) return;
    onUpgrade(building);
    play("build");
    juice("medium", undefined, window.innerHeight * 0.45);
    setRaised({ building, key: Date.now() });
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#0B1B3F] [container-type:size]" data-testid="my-city">
      <CityView
        key={page}
        theme={page}
        levels={levels}
        onPick={raise}
        pop={raised?.building ?? null}
        popKey={raised?.key ?? 0}
        celebrateKey={party}
        resident={state.pet ? { element: state.pet.element, stage: state.pet.stage, legend: holdsNft(state) } : null}
      />

      {/* Top: back to the board, your money, and the pages (finished ones can be looked at). */}
      <header className="relative z-10 space-y-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full border-2 border-[#FBD000] bg-[#049CD8] text-2xl font-black text-white shadow-md"
            aria-label={t("返回棋盤")}
            data-testid="city-back"
          >
            ←
          </button>
          <p className="rounded-full border-2 border-[#FBD000] bg-[#1E3A8A] px-3 py-1 text-base font-black text-white shadow-md" data-testid="theme-name">
            {t(shown.name)}
          </p>
          <div className="flex items-center gap-1.5 rounded-full border-2 border-[#FBD000] bg-white py-1 pl-1.5 pr-3 text-lg font-black tabular-nums text-[#1E3A8A] shadow-md">
            <img src="/art/ui/coin.webp" alt={t("金幣")} draggable={false} className="-my-2 -ml-3 size-10 object-contain drop-shadow" />
            <span key={state.points} className="inline-block animate-[bump_0.35s_ease-out]">
              {state.points}
            </span>
          </div>
        </div>
        <nav className="flex justify-center gap-1.5" aria-label={t("主題")}>
          {THEMES.map((theme, i) => {
            const locked = i > state.theme;
            const done = i < state.theme || (i === state.theme && pageDone(state.levels));
            return (
              <button
                key={theme.id}
                type="button"
                disabled={locked}
                onClick={() => {
                  setFinished(null);
                  setPage(i);
                }}
                aria-pressed={page === i}
                className={cn(
                  "rounded-full border-2 px-2.5 py-0.5 text-xs font-black shadow",
                  page === i ? "border-[#FBD000] bg-[#FFF8D6] text-[#1E3A8A]" : "border-white/40 bg-white/15 text-white",
                  locked && "opacity-40",
                )}
                data-testid={`theme-${i}`}
              >
                {locked ? "🔒" : done ? "✓" : "★"} {i + 1}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Bottom: one card per building on the page you're building, or a note on a finished page. */}
      <footer className="relative z-10 mt-auto rounded-t-[32px] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.9rem)] pt-3 shadow-[0_-6px_20px_rgba(30,58,138,0.25)]">
        {finished !== null ? (
          <div className="space-y-2 text-center" data-testid="theme-finished">
            <p className="text-lg font-black text-[#E52521]">{t("🎉 完成咗「{name}」！", { name: t(THEMES[finished].name) })}</p>
            <p className="text-sm font-bold text-[#1E3A8A]">
              {t("獎勵：{c} 金幣同 {d} 粒骰", { c: themeRewardCoins(finished), d: THEME_REWARD_DICE })}
            </p>
            {state.theme > finished ? (
              <button
                type="button"
                onClick={() => {
                  setFinished(null);
                  setPage(state.theme);
                }}
                className="h-12 w-full cursor-pointer rounded-full border-4 border-[#FBD000] bg-[#16A34A] text-lg font-black text-white shadow-[0_4px_0_#166534]"
                data-testid="next-theme"
              >
                {t("去下一頁：{name}", { name: t(THEMES[state.theme].name) })}
              </button>
            ) : (
              <p className="text-sm font-bold text-[#1E3A8A]">{t("所有主題都完成咗，新主題陸續有嚟！")}</p>
            )}
          </div>
        ) : !current ? (
          <p className="py-3 text-center text-sm font-black text-[#1E3A8A]" data-testid="theme-locked">
            {t("✓ 已經完成，鎖住咗，冇人打得到")}
          </p>
        ) : (
          <div className="grid grid-cols-5 gap-1.5">
            {state.levels.map((level, building) => {
              const cost = upgradeCost(state, building);
              const affordable = canUpgrade(state, building);
              const repair = isRepair(state, building);
              const maxed = level >= MAX_LEVEL;
              return (
                <button
                  key={building}
                  type="button"
                  onClick={() => raise(building)}
                  disabled={!affordable}
                  className={cn(
                    "relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-[3px] px-0.5 pb-1.5 pt-1.5 transition-transform active:translate-y-0.5 disabled:cursor-default",
                    affordable ? "border-[#FBD000] bg-[#FFF8D6] shadow-[0_4px_0_#E0A800]" : "border-[#D6DEEA] bg-[#F1F4F9]",
                  )}
                  aria-label={maxed ? t("{b}已經最高級", { b: t(LANDMARK_NAMES[building]) }) : t(repair ? "修返{b}，要 {n} 金幣" : "升級{b}，要 {n} 金幣", { b: t(LANDMARK_NAMES[building]), n: cost ?? 0 })}
                  data-testid={`upgrade-${building}`}
                >
                  {firstTime && affordable && building === 0 ? <TipHand className="-top-11 left-1/2 -translate-x-1/2" /> : null}
                  <span className="text-[11px] font-black text-[#1E3A8A]">{t(LANDMARK_NAMES[building])}</span>
                  {repair ? <span className="absolute right-0.5 top-0.5 text-sm" aria-hidden>🔧</span> : null}
                  {artPicture(shown, building, level) ? (
                    <img
                      src={artPicture(shown, building, level)!}
                      alt=""
                      className={cn("h-12 w-full object-contain drop-shadow", level <= 0 && "opacity-40 grayscale")}
                      data-testid={`card-art-${building}`}
                    />
                  ) : null}
                  <LevelPips level={level} best={state.best[building]} />
                  {maxed ? (
                    <span className="text-base" aria-hidden>👑</span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-xs font-black tabular-nums text-[#1E3A8A]">
                      <img src="/art/ui/coin.webp" alt="" className="size-4" />
                      {cost}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </footer>
    </main>
  );
}
