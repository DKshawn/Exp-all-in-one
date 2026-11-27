"use client";
import { createContext, useContext, useSyncExternalStore } from "react";
import { translator, type UiLanguage } from "@/lib/ui-language";

const storageKey = "evolution-language";
let tabLanguage: UiLanguage = "ja";
let useTabPreference = false;
function subscribe(fn: () => void) {
  window.addEventListener("storage", fn);
  window.addEventListener(storageKey, fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener(storageKey, fn);
  };
}
export function getExperimentLanguage(): UiLanguage {
  if (useTabPreference) return tabLanguage;
  try {
    const v = localStorage.getItem(storageKey);
    if (v === null) {
      const legacy = localStorage.getItem("judgment.teacher.language");
      return legacy === "zh" ? "zh-CN" : legacy === "en" ? "en" : "ja";
    }
    return v === "en" || v === "zh-CN" ? v : "ja";
  } catch {
    return tabLanguage;
  }
}

export function setExperimentLanguage(language: UiLanguage) {
  tabLanguage = language;
  try {
    localStorage.setItem(storageKey, language);
    useTabPreference = false;
  } catch {
    useTabPreference = true;
  }
  window.dispatchEvent(new Event(storageKey));
}

export function useExperimentLanguage() {
  return useSyncExternalStore(
    subscribe,
    getExperimentLanguage,
    () => "ja" as UiLanguage,
  );
}
export const SetupLanguage = createContext<UiLanguage>("ja");

export function useSetupText() {
  return translator(useContext(SetupLanguage));
}

export function ExperimentText({
  ja,
  zh,
  en,
}: {
  ja: string;
  zh: string;
  en: string;
}) {
  const lang = useExperimentLanguage();
  return <span lang={lang}>{translator(lang)(ja, zh, en)}</span>;
}

export function ExperimentLanguageSelect({ disabled }: { disabled?: boolean }) {
  const lang = useExperimentLanguage();
  const label = translator(lang)("表示言語", "显示语言", "Language");
  return (
    <span className="header-language">
      <select
        className="header-language-select"
        name="language"
        lang={lang}
        aria-label={label}
        title={label}
        value={lang}
        disabled={disabled}
        onChange={(e) => setExperimentLanguage(e.target.value as UiLanguage)}
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
    </span>
  );
}
