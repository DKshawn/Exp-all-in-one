"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export type DetailDialogProps = {
  label: string;
  title?: string;
  closeLabel?: string;
  children: ReactNode;
  triggerClassName?: string;
  disabled?: boolean;
  open?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  className?: string;
};

export function DetailDialog({
  label,
  title = label,
  closeLabel = "閉じる",
  children,
  triggerClassName = "text-button study-detail-trigger",
  disabled = false,
  open,
  onOpen,
  onClose,
  className = "",
}: DetailDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element || open === undefined || element.open === open) return;
    if (open) element.showModal();
    else element.close();
  }, [open]);

  return (
    <>
      {(open === undefined || onOpen) && (
        <button
          type="button"
          className={triggerClassName}
          aria-haspopup="dialog"
          data-audit-button={`details.open:${title}`}
          disabled={disabled}
          onClick={() => {
            if (open === undefined) dialog.current?.showModal();
            onOpen?.();
          }}
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
            <X size={16} /> {closeLabel}
          </button>
        </div>
        <div className="study-detail-content">{children}</div>
      </dialog>
    </>
  );
}
