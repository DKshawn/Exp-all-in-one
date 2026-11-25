"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useSetupText } from "@/components/experiment-language";

/** Keep supplementary tables from growing the live trading screen. */
export function StudyDetailDialog({
  label,
  title = label,
  closeLabel,
  children,
  triggerClassName = "text-button study-detail-trigger",
  disabled = false,
  open,
  onClose,
  className = "",
}: {
  label: string;
  title?: string;
  closeLabel?: string;
  children: ReactNode;
  triggerClassName?: string;
  disabled?: boolean;
  open?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const t = useSetupText();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open === undefined) return;
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      {open === undefined && (
        <button
          type="button"
          className={triggerClassName}
          aria-haspopup="dialog"
          data-audit-button={`details.open:${title}`}
          disabled={disabled}
          onClick={() => dialog.current?.showModal()}
        >
          {label}
        </button>
      )}
      <dialog
        ref={dialog}
        className={`study-detail-dialog ${className}`}
        aria-labelledby={titleId}
        onClose={onClose}
      >
        <div className="study-detail-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="button secondary"
            data-audit-button={`details.close:${title}`}
            onClick={() => dialog.current?.close()}
          >
            <X size={16} /> {closeLabel ?? t("閉じる", "关闭", "Close")}
          </button>
        </div>
        <div className="study-detail-content">{children}</div>
      </dialog>
    </>
  );
}
