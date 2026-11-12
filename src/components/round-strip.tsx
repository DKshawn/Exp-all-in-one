"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function RoundStrip({
  rounds,
  current,
  finished,
  label,
  roundLabel,
  children,
}: {
  rounds: number;
  current: number;
  finished: boolean;
  label: string;
  roundLabel: (n: number) => string;
  children?: (n: number) => ReactNode;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = strip.current;
    if (!node) return;
    const step = node.querySelector<HTMLElement>('[aria-current="step"]');
    if (step && node.scrollWidth > node.clientWidth) {
      const delta =
        step.getBoundingClientRect().left - node.getBoundingClientRect().left;
      if (delta < 0 || delta + step.offsetWidth > node.clientWidth)
        node.scrollLeft += delta - node.clientWidth / 2 + step.offsetWidth / 2;
    }
  }, [current, finished]);
  return (
    <div
      ref={strip}
      className={`round-strip ${children ? "" : "exp2-rounds"}`}
      role="list"
      aria-label={label}
    >
      {Array.from({ length: rounds }, (_, i) => {
        const n = i + 1,
          active = n === current && !finished,
          done = n < current || (n === current && finished);
        return (
          <div
            key={n}
            role="listitem"
            className={`round-step ${done ? "done" : active ? "active" : ""}`}
            aria-label={roundLabel(n)}
            aria-current={active ? "step" : undefined}
          >
            <span>{n}</span>
            {children?.(n)}
          </div>
        );
      })}
    </div>
  );
}
export const clockText = (seconds: number) =>
  Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0") +
  ":" +
  (seconds % 60).toString().padStart(2, "0");
