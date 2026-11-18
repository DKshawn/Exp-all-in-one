"use client";
import { useSyncExternalStore } from "react";
import type { Language } from "../types";
const labels = {
  "読み込み中…": ["正在加载…", "Loading…"],
  学生証番号: ["学生证号", "Student ID"],
  状態: ["状态", "Status"],
  回答中: ["作答中", "In progress"],
  完了: ["已完成", "Completed"],
  実施中: ["进行中", "In progress"],
  プレビュー: ["预览", "Preview"],
  実施する課題: ["实施任务", "Tasks to run"],
  すべて選択: ["全选", "Select all"],
  選択を解除: ["取消选择", "Clear selection"],
  "{count}課題を選択": ["已选 {count} 项", "{count} tasks selected"],
  課題の順番を学生ごとにランダム化: [
    "每位学生的任务顺序随机",
    "Randomize task order for each student",
  ],
  選択肢の順番をランダム化: ["选项顺序随机", "Randomize choice order"],
  課題の詳細: ["任务详情", "Task details"],
  "{name}の詳細": ["{name}的详情", "Details: {name}"],
  "所要時間の目安：約{minutes}分": [
    "预计用时：约 {minutes} 分钟",
    "Estimated time: about {minutes} minutes",
  ],
  実施条件: ["实施条件", "Conditions"],
  閉じる: ["关闭", "Close"],
  実験名: ["实验名称", "Experiment title"],
  教員パスワード: ["教师密码", "Teacher password"],
  "8文字以上で設定": ["至少 8 个字符", "At least 8 characters"],
  "再入室に使います。学生には共有しないでください。": [
    "用于再次进入，请勿分享给学生。",
    "Use it to re-enter. Do not share it with students.",
  ],
  "管理者が接続設定を完了してから作成してください。": [
    "请等待管理员完成连接设置。",
    "Wait for the administrator to finish connection setup.",
  ],
  "処理中…": ["处理中…", "Processing…"],
  ルームを作成: ["创建房间", "Create room"],
  "準備中…": ["准备中…", "Preparing…"],
  デモを開始: ["开始 Demo", "Start demo"],
  ルーム管理: ["房间管理", "Room management"],
  教員として再入室: ["教师重新进入", "Re-enter as teacher"],
  "第{number}回 実施中": ["第 {number} 次进行中", "Run {number} in progress"],
  実施終了: ["已结束", "Run ended"],
  開始前: ["开始前", "Not started"],
  "参加者 {count} 人": ["参与者 {count} 人", "Participants: {count}"],
  "回答完了 {count} 人": ["完成作答 {count} 人", "Completed: {count}"],
  学生の入室画面: ["学生入口", "Student entrance"],
  学生画面をプレビュー: ["预览学生画面", "Preview student view"],
  実験を終了: ["结束实验", "End experiment"],
  "デモを終了して実験設定に戻ります。": [
    "结束本次演示并返回实验设置。",
    "End the demo and return to experiment settings.",
  ],
  "開始中…": ["正在开始…", "Starting…"],
  次の実施を開始: ["开始下一次实验", "Start next run"],
  実施を開始: ["开始实验", "Start run"],
  参加状況: ["参与情况", "Student progress"],
  "全記録 JSON": ["全部记录 JSON", "All records JSON"],
  回答ページ: ["作答页数", "Pages answered"],
  待機中: ["等待中", "Waiting"],
  終了: ["已结束", "Ended"],
  "学生の入室を待っています。": [
    "等待学生进入。",
    "Waiting for students to join.",
  ],
  実施履歴: ["实验历史", "Run history"],
  "第{number}回": ["第 {number} 次", "Run {number}"],
  "{count}課題": ["{count} 项任务", "{count} tasks"],
  "今回の実施を終了しますか？": ["结束本次实验？", "End this run?"],
  "回答中の学生も終了します。保存済みの回答は残ります。": [
    "仍在作答的学生也会结束，已保存的回答将保留。",
    "Students still answering will also stop. Saved responses are retained.",
  ],
  戻る: ["返回", "Back"],
  "終了中…": ["正在结束…", "Ending…"],
  終了する: ["结束", "End run"],
  DEMOモード: ["演示模式", "Demo mode"],
  DEMOモードを終了: ["退出演示模式", "Exit demo mode"],
  学生画面のプレビュー: ["学生画面预览", "Student preview"],
  "回答は保存されません。制限時間は停止しています。": [
    "不保存回答，计时限制暂停。",
    "Responses are not saved. Time limits are paused.",
  ],
  前のページ: ["上一页", "Previous page"],
  スキップ: ["跳过", "Skip"],
} satisfies Record<string, [string, string]>;
export function teacherText(
  text: string,
  language: Language,
  values: Record<string, string | number> = {},
): string {
  const pair = labels[text as keyof typeof labels];
  const translated =
    language === "ja" ? text : (pair?.[language === "zh" ? 0 : 1] ?? text);
  return translated.replace(/\{(\w+)\}/g, (match: string, key: string) =>
    String(values[key] ?? match),
  );
}
const storageKey = "judgment.teacher.language";
const changeEvent = "judgment-teacher-language";
let fallback: Language = "ja";
function getLanguage(): Language {
  let value: string | null = fallback;
  try {
    value = localStorage.getItem(storageKey) ?? fallback;
  } catch {}
  return value === "en" || value === "zh" ? value : "ja";
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changeEvent, listener);
  };
}
export function useTeacherLanguage() {
  const language = useSyncExternalStore(
    subscribe,
    getLanguage,
    () => "ja" as Language,
  );
  return [
    language,
    (value: Language) => {
      fallback = value;
      try {
        localStorage.setItem(storageKey, value);
      } catch {}
      window.dispatchEvent(new Event(changeEvent));
    },
  ] as const;
}
export function TeacherLanguage({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) {
  return (
    <select
      className="judgment-language"
      aria-label="言語 / 语言 / Language"
      value={language}
      onChange={(e) => onChange(e.target.value as Language)}
    >
      <option value="ja">日本語</option>
      <option value="zh">中文</option>
      <option value="en">English</option>
    </select>
  );
}
