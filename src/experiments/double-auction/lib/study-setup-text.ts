import type { translator } from "@/lib/ui-language";

type Translator = ReturnType<typeof translator>;

export function studySetupError(t: Translator, message: string) {
  if (!message) return "";
  const limits = message.match(/(\d+)〜(\d+)/);
  const range = limits ? `${limits[1]}–${limits[2]}` : "";
  if (message.includes("期数") && range)
    return t(
      message,
      `每种制度的期数必须是 ${range} 之间的整数。`,
      `Enter a whole number of periods between ${range} for each institution.`,
    );
  if (message.includes("秒") && range)
    return t(
      message,
      `时长必须是 ${range} 秒之间的整数。`,
      `Enter a whole number of seconds between ${range}.`,
    );
  if (message.includes("1人あたりの単位数") && range)
    return t(
      message,
      `每人单位数必须是 ${range} 之间的整数。`,
      `Enter a whole number of units per participant between ${range}.`,
    );
  if (message.includes("市場数は") && range)
    return t(
      message,
      `市场数必须是 ${range} 之间的整数。`,
      `Enter a whole number of markets between ${range}.`,
    );
  if (message.includes("人数は") && range)
    return t(
      message,
      `人数必须是 ${range} 之间的整数。`,
      `Enter a whole number of participants between ${range}.`,
    );
  if (message.includes("Commission") && range)
    return t(
      message,
      `佣金必须是 ${range} 日元之间的整数。`,
      `Enter a whole-yen commission between ${range}.`,
    );
  if (message.includes("K＋L")) {
    const limit = message.match(/総単位数(\d+)/)?.[1];
    if (limit)
      return t(
        message,
        `K + L 不能超过单侧总单位数 ${limit}。`,
        `K + L cannot exceed ${limit}, the number of units per side.`,
      );
  }
  if (message === "実施する制度を1つ以上選択してください。")
    return t(
      message,
      "请至少选择一种交易制度。",
      "Select at least one institution.",
    );
  if (message === "実験名を入力してください。")
    return t(message, "请输入实验名称。", "Enter a room title.");
  return t(
    message,
    "请检查实验设置和连接后重试。",
    "Check the experiment settings and connection, then try again.",
  );
}
