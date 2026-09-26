"use client";

import { LANGS, setLang, useLang } from "@/lib/i18n";
import { cn } from "cn";

/** 繁 / 简 / EN switch. */
export function LangPicker({ className }: { className?: string }) {
  const { lang, t } = useLang();
  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label={t("語言")} data-testid="lang-picker">
      {LANGS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setLang(item.id)}
          aria-pressed={lang === item.id}
          className={cn(
            "h-9 min-w-11 cursor-pointer rounded-full border-2 px-2 text-sm font-black",
            lang === item.id ? "border-[#FBD000] bg-[#E52521] text-white" : "border-[#D6DEEA] bg-white text-[#1E3A8A]",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
