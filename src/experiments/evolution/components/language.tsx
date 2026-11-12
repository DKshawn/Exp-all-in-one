"use client";
import { useSyncExternalStore } from "react";
import { label, type Lang } from "../locale";

const storageKey = "evolution-language";
function subscribe(fn: () => void) {
  window.addEventListener("storage", fn);
  window.addEventListener(storageKey, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(storageKey, fn);
  };
}
function language(): Lang {
  const v = localStorage.getItem(storageKey);
  return v === "en" || v === "zh-CN" ? v : "ja";
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
        localStorage.setItem(storageKey, e.target.value);
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
