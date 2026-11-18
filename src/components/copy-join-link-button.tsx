"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

const labels = {
  ja: {
    copy: "参加リンクをコピー",
    copied: "コピーしました",
    manual: "リンクを手動でコピー",
  },
  "zh-CN": { copy: "复制入室链接", copied: "已复制", manual: "手动复制链接" },
  en: {
    copy: "Copy join link",
    copied: "Link copied",
    manual: "Copy the link manually",
  },
};

type Feedback = { status: "copied" } | { status: "manual"; url: string };

export function CopyJoinLinkButton({
  href,
  lang = "ja",
  className = "small-button",
  disabledReason,
}: {
  href: string;
  lang?: keyof typeof labels;
  className?: string;
  disabledReason?: string;
}) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const t = labels[lang];
  const copied = feedback?.status === "copied";
  useEffect(() => {
    if (feedback?.status !== "copied") return;
    const timer = window.setTimeout(() => setFeedback(null), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function copy() {
    const url = new URL(href, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setFeedback({ status: "copied" });
    } catch {
      setFeedback({ status: "manual", url });
    }
  }

  return (
    <>
      <button
        type="button"
        className={`button secondary ${className}`.trim()}
        disabled={Boolean(disabledReason)}
        title={disabledReason}
        onClick={copy}
      >
        {copied ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Copy size={15} aria-hidden="true" />
        )}
        <span aria-live="polite">{copied ? t.copied : t.copy}</span>
      </button>
      {feedback?.status === "manual" && (
        <label className="field join-link-fallback">
          <span role="status">{t.manual}</span>
          <input
            type="text"
            readOnly
            value={feedback.url}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </>
  );
}
