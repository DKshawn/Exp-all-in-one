"use client";
import { useId } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
const japanese = {
  field: "入室受付時間（秒）",
  counter: "入室締切まで",
  paused: "入室締切まで（一時停止中）",
  start: "締切タイマーを開始",
  resume: "締切タイマーを再開",
  pause: "締切タイマーを一時停止",
  reset: "締切タイマーをリセット",
};
export function AdmissionTimer({
  seconds,
  onSeconds,
  running,
  paused,
  remaining,
  disabled,
  canStart,
  onStart,
  onPause,
  onReset,
  labels = japanese,
}: {
  seconds: string;
  onSeconds: (s: string) => void;
  running: boolean;
  paused: boolean;
  remaining: number;
  disabled: boolean;
  canStart: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  labels?: typeof japanese;
}) {
  const id = useId();
  return (
    <div className="study-admission-timer-field">
      <span id={id}>{labels.field}</span>
      <div className="study-admission-timer" role="group" aria-labelledby={id}>
        {running || paused ? (
          <output
            className="study-admission-countdown"
            role="timer"
            aria-label={paused ? labels.paused : labels.counter}
          >
            {remaining}
          </output>
        ) : (
          <input
            aria-labelledby={id}
            type="number"
            min={5}
            max={3600}
            step={1}
            value={seconds}
            disabled={disabled}
            onChange={(e) => onSeconds(e.target.value)}
          />
        )}
        <button
          type="button"
          className="study-admission-timer-action"
          aria-label={paused ? labels.resume : labels.start}
          title={paused ? labels.resume : labels.start}
          disabled={disabled || running || (!paused && !canStart)}
          onClick={onStart}
        >
          <Play size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="study-admission-timer-action"
          aria-label={labels.pause}
          title={labels.pause}
          disabled={disabled || !running}
          onClick={onPause}
        >
          <Pause size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="study-admission-timer-action"
          aria-label={labels.reset}
          title={labels.reset}
          disabled={disabled || (!running && !paused)}
          onClick={onReset}
        >
          <RotateCcw size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
