export type UiLanguage = "ja" | "zh-CN" | "en";

export function translator(language: UiLanguage) {
  return (ja: string, zh: string, en: string) =>
    language === "zh-CN" ? zh : language === "en" ? en : ja;
}
