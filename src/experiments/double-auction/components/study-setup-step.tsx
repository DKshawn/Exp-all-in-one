"use client";

import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useSetupText } from "@/components/experiment-language";

/** The same accordion presentation in the creation dialog and room preparation. */
export function StudySetupStep({
  id,
  index,
  label,
  summary,
  expanded,
  complete,
  disabled,
  onOpen,
  children,
  footer,
}: {
  id: string;
  index: number;
  label: string;
  summary: string;
  expanded: boolean;
  complete: boolean;
  disabled: boolean;
  onOpen: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useSetupText();
  return (
    <section className={`study-setup-step ${expanded ? "active" : ""}`}>
      <h3>
        <button
          type="button"
          id={`${id}-heading-${index}`}
          className="study-setup-step-toggle"
          aria-expanded={expanded}
          aria-controls={`${id}-panel-${index}`}
          disabled={disabled}
          onClick={onOpen}
        >
          <span className={`study-setup-number ${complete ? "complete" : ""}`}>
            {complete ? <Check size={16} /> : index + 1}
          </span>
          <span className="study-setup-step-title">
            <b>{label}</b>
            <small>{summary}</small>
          </span>
          <span className="study-setup-step-state">
            {expanded
              ? t("設定中", "设置中", "Active")
              : complete
                ? t("変更", "修改", "Edit")
                : disabled
                  ? t("未確認", "待确认", "Pending")
                  : t("開く", "打开", "Open")}
          </span>
          <ChevronDown size={16} />
        </button>
      </h3>
      <div
        id={`${id}-panel-${index}`}
        className="study-setup-step-content"
        role="region"
        aria-labelledby={`${id}-heading-${index}`}
        hidden={!expanded}
      >
        {children}
      </div>
      {footer && <div className="study-setup-step-footer">{footer}</div>}
    </section>
  );
}
