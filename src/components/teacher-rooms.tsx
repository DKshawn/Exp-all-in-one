"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FlaskConical, RefreshCw, Search, Trash2 } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/client";
import type { RoomSummary } from "@/lib/room-management";
import { EXPERIMENT_CATALOG } from "@/lib/experiment-catalog";
import { teacherReentryHref } from "@/lib/room-navigation";
import type { ServerStatus } from "@/lib/server/config";
import type { Phase } from "@/experiments/double-auction/lib/types";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import { Spinner } from "./shell";

const PHASE_LABELS: Record<Phase, string> = {
  waiting: "入室待ち",
  running: "実験中",
  paused: "一時停止",
  review: "今期終了",
  finished: "実験終了",
};
const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});
const monthFormat = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "long",
  timeZone: "Asia/Tokyo",
});

export function TeacherRooms({ status }: { status: ServerStatus }) {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [pending, setPending] = useState(status.ready);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [experiment, setExperiment] = useState("");
  const [month, setMonth] = useState("");
  const [phase, setPhase] = useState("");
  const [limit, setLimit] = useState(20);
  const [deleting, setDeleting] = useState<RoomSummary | null>(null);

  useEffect(() => {
    if (!status.ready) return;
    const controller = new AbortController();
    api<{ rooms: RoomSummary[] }>("/api/rooms/manage", {}, controller.signal)
      .then((result) => setRooms(result.rooms))
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [status.ready]);

  async function load() {
    setPending(true);
    setError("");
    try {
      const result = await api<{ rooms: RoomSummary[] }>(
        "/api/rooms/manage",
        {},
      );
      setRooms(result.rooms);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && rooms !== null) {
        setRooms(null);
      }
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  async function remove(room: RoomSummary) {
    const response = await fetch(`/api/rooms/${room.code}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok)
      throw new ApiError(
        result.error || "削除に失敗しました。",
        response.status,
      );
    setRooms((previous) => previous?.filter((r) => r.code !== room.code) ?? []);
    setMessage(`ルーム ${room.code} を削除しました。`);
    setDeleting(null);
  }

  const entries = (rooms ?? []).map((room) => ({
    room,
    createdMonth: monthFormat.format(room.createdAt),
    experimentName: EXPERIMENT_CATALOG[room.experiment].title,
  }));
  const months = [
    ...new Set([month, ...entries.map((entry) => entry.createdMonth)]),
  ]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a, "ja-JP", { numeric: true }));
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const filtered = entries.filter(
    ({ room, createdMonth, experimentName }) =>
      (!normalizedQuery ||
        `${room.title} ${room.code} ${experimentName}`
          .toLocaleLowerCase("ja-JP")
          .includes(normalizedQuery)) &&
      (!experiment || room.experiment === experiment) &&
      (!month || createdMonth === month) &&
      (!phase || room.phase === phase),
  );

  return (
    <section className="teacher-rooms" aria-labelledby="teacher-rooms-title">
      <div className="teacher-rooms-heading">
        <h2 id="teacher-rooms-title">ルーム管理</h2>
        <button
          className="button secondary small-button"
          disabled={pending || !status.ready}
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
          更新
        </button>
      </div>

      {!status.ready && (
        <p className="error-message" role="alert">
          アプリの接続設定が完了していません。管理者がデータベースと教員用キーを設定してください。
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="teacher-rooms-message" role="status">
          {message}
        </p>
      )}
      {rooms !== null && (
        <>
          <search
            className="teacher-room-filters"
            aria-label="ルームの絞り込み"
          >
            <label className="field teacher-room-search">
              実験名・ルームコード
              <span>
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder="名前またはコードで検索"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setLimit(20);
                  }}
                />
              </span>
            </label>
            <label className="field teacher-room-experiment-filter">
              実験
              <select
                value={experiment}
                onChange={(event) => {
                  setExperiment(event.target.value);
                  setLimit(20);
                }}
              >
                <option value="">すべての実験</option>
                {Object.entries(EXPERIMENT_CATALOG).map(
                  ([value, { title }]) => (
                    <option key={value} value={value}>
                      {title}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="field">
              作成月
              <select
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setLimit(20);
                }}
              >
                <option value="">すべての月</option>
                {months.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              状態
              <select
                value={phase}
                onChange={(event) => {
                  setPhase(event.target.value);
                  setLimit(20);
                }}
              >
                <option value="">すべての状態</option>
                {Object.entries(PHASE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </search>
          <p className="teacher-room-count" role="status">
            {filtered.length}件 / 全{rooms.length}件 · 新しい順
          </p>
          {filtered.length === 0 ? (
            <p className="teacher-rooms-empty">
              {rooms.length
                ? "条件に一致するルームはありません。"
                : "保存済みのルームはありません。"}
            </p>
          ) : (
            <ul className="teacher-room-list">
              {filtered.slice(0, limit).map(({ room, experimentName }) => (
                <li className="teacher-room-card" key={room.code}>
                  <div className="teacher-room-card-heading">
                    <span className="teacher-room-experiment">
                      {experimentName}
                    </span>
                    <span className={`teacher-room-status is-${room.phase}`}>
                      {PHASE_LABELS[room.phase]}
                    </span>
                  </div>
                  <h3>{room.title}</h3>
                  <div className="teacher-room-meta">
                    <span className="teacher-room-code">{room.code}</span>
                    <span>作成 {dateFormat.format(room.createdAt)}</span>
                    <span>
                      {room.experiment !== "judgment" &&
                        `${room.marketCount}${room.experiment === "evolution" ? "グループ" : "市場"} · `}
                      参加者 {room.participantCount}
                      {!room.flexibleAdmission && `/${room.capacity}`}人
                    </span>
                    <span>
                      {room.experiment === "judgment" ? (
                        `実施 ${room.round}回`
                      ) : (
                        <>
                          第{room.round}/{room.totalRounds}
                          {room.experiment === "emh" ||
                          room.experiment === "evolution"
                            ? "ラウンド"
                            : "期"}
                        </>
                      )}
                    </span>
                  </div>
                  {room.experiment === "institutions" && (
                    <div className="teacher-room-institutions">
                      {room.institutions.length ? (
                        room.institutions.map(({ institution, periods }) => (
                          <span key={institution}>
                            {INSTITUTIONS[institution].short} {periods}期
                          </span>
                        ))
                      ) : (
                        <span>旧版 CDA {room.totalRounds}期</span>
                      )}
                    </div>
                  )}
                  <div className="teacher-room-actions">
                    <Link
                      className="button secondary small-button"
                      href={teacherReentryHref(room.code)}
                      aria-label={`結果・ダウンロード / 再入室 (${room.code})`}
                    >
                      結果・ダウンロード / 再入室
                    </Link>
                    <button
                      className="button secondary small-button danger-text"
                      onClick={() => {
                        setMessage("");
                        setDeleting(room);
                      }}
                      aria-label={`${room.code} を削除`}
                    >
                      <Trash2 size={14} /> 削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {filtered.length > limit && (
            <button
              className="button secondary full"
              onClick={() => setLimit((previous) => previous + 20)}
            >
              次の20件を表示
            </button>
          )}
        </>
      )}
      {pending && (
        <p className="teacher-rooms-loading" role="status">
          <Spinner /> ルームを読み込み中…
        </p>
      )}
      {status.mode === "local" && (
        <p className="local-note">
          <FlaskConical size={14} />
          このコンピューターに保存されたルームを表示しています。
        </p>
      )}
      {deleting && (
        <DeleteRoomDialog
          room={deleting}
          onCancel={() => setDeleting(null)}
          onDelete={() => remove(deleting)}
        />
      )}
    </section>
  );
}

function DeleteRoomDialog({
  room,
  onCancel,
  onDelete,
}: {
  room: RoomSummary;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog teacher-room-delete"
      aria-labelledby="room-delete-title"
      aria-describedby="room-delete-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id="room-delete-title">ルーム {room.code} を削除しますか？</h2>
      <p className="teacher-room-delete-name">{room.title}</p>
      <p id="room-delete-description">
        {room.phase !== "waiting" &&
          room.phase !== "finished" &&
          "実験中の参加者は、このルームを利用できなくなります。"}
        参加者情報・取引履歴・実験結果もすべて削除されます。この操作は取り消せません。必要な結果は再入室してダウンロードしてください。
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          try {
            await onDelete();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setPending(false);
          }
        }}
      >
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onCancel}
          >
            戻る
          </button>
          <button
            className="button teacher-room-delete-button"
            disabled={pending}
          >
            {pending ? "削除中…" : "このルームを削除"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
