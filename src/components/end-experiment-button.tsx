import type { MouseEventHandler } from "react";

export function EndExperimentButton({
  label = "実験を終了",
  disabled,
  className = "",
  onClick,
}: {
  label?: string;
  disabled?: boolean;
  className?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className={`button danger ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
