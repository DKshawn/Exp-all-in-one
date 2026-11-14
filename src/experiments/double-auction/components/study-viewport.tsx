"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  fitStudyViewport,
  STUDY_VIEWPORT_BASE,
} from "@/experiments/double-auction/lib/study-viewport";

/** Fit the desktop workstation; let narrow student screens reflow at native size. */
export function StudyViewport({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<{
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setAvailable((previous) =>
        previous?.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const compact = available !== null && available.width <= 760;
  const fit =
    available && !compact
      ? fitStudyViewport(available.width, available.height)
      : { ...STUDY_VIEWPORT_BASE, scale: 1 };
  return (
    <div
      className={
        compact
          ? "study-fit-viewport study-compact-viewport"
          : "study-fit-viewport"
      }
      ref={viewport}
    >
      <div
        className="study-fit-canvas"
        data-study-scale={fit.scale}
        data-viewport-width={available && Math.round(available.width)}
        data-viewport-height={available && Math.round(available.height)}
        style={
          compact
            ? undefined
            : {
                width: fit.width,
                height: fit.height,
                transform: `translate(-50%, -50%) scale(${fit.scale})`,
                visibility: available ? undefined : "hidden",
              }
        }
      >
        {children}
      </div>
    </div>
  );
}
