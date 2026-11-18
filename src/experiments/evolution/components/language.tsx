"use client";
import { useSyncExternalStore } from "react";
import { label, type Lang } from "../locale";

const storageKey = "evolution-language";
let tabLanguage: Lang = "ja";
let useTabPreference = false;
function subscribe(fn: () => void) {
  window.addEventListener("storage", fn);
  window.addEventListener(storageKey, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(storageKey, fn);
  };
}
function language(): Lang {
  if (useTabPreference) return tabLanguage;
  try {
    const v = localStorage.getItem(storageKey);
    return v === "en" || v === "zh-CN" ? v : "ja";
  } catch {
    return tabLanguage;
  }
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, language, () => "ja" as Lang);
}
export function EvolutionLanguage() {
  const lang = useLanguage();
  return (
    <select
      className="ev-lang"
      lang={lang}
      aria-label={label(lang, "language")}
      value={lang}
      onChange={(e) => {
        tabLanguage = e.target.value as Lang;
        try {
          localStorage.setItem(storageKey, tabLanguage);
          useTabPreference = false;
        } catch {
          // Reads may still succeed and return an older saved preference.
          useTabPreference = true;
        }
        window.dispatchEvent(new Event(storageKey));
      }}
    >
      <option value="ja" lang="ja">
        日本語
      </option>
      <option value="zh-CN" lang="zh-CN">
        中文
      </option>
      <option value="en" lang="en">
        English
      </option>
    </select>
  );
}
