"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, RefreshCw, Search, Trash2 } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/client";
import type { RoomSummary } from "@/lib/room-management";
import { EXPERIMENT_CATALOG } from "@/lib/experiment-catalog";
import { teacherReentryHref } from "@/lib/room-navigation";
import type { ServerStatus } from "@/lib/server/config";
import type { Phase } from "@/experiments/double-auction/lib/types";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import { EMH_EXPERIMENT_LABELS } from "@/experiments/emh/types";
import { H5_PROTOCOL } from "@/experiments/evolution/settings";
import { label } from "@/experiments/evolution/locale";
import { translator, type UiLanguage } from "@/lib/ui-language";
import { useExperimentLanguage } from "./experiment-language";
import { Spinner } from "./shell";

const PHASE_LABELS: Record<Phase, [string, string, string]> = {
  waiting: ["入室待ち", "等待入室", "Waiting"],
  running: ["実験中", "实验进行中", "Running"],
  paused: ["一時停止", "已暂停", "Paused"],
  review: ["今期終了", "本期结束", "Period ended"],
  finished: ["実験終了", "实验结束", "Finished"],
};
function experimentGroups(
  language: UiLanguage,
): Partial<
  Record<string, { name: string; variants: Readonly<Record<string, string>> }>
> {
  const t = translator(language);
  return {
    emh: {
      name: "EMH",
      variants: {
        exp1: t(
          EMH_EXPERIMENT_LABELS.exp1,
          "实验 1（固定股息）",
          "Experiment 1 (Fixed dividends)",
        ),
        exp2: t(
          EMH_EXPERIMENT_LABELS.exp2,
          "实验 2（随机股息）",
          "Experiment 2 (Random dividends)",
        ),
      },
    },
    evolution: {
      name: "SEG",
      variants: {
        coordination: label(language, "coordination"),
        [H5_PROTOCOL]: label(language, "h5Title"),
        demand: label(language, "demand"),
      },
    },
  };
}
const monthKey = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Asia/Tokyo",
});

export function TeacherRooms({ status }: { status: ServerStatus }) {
  const language = useExperimentLanguage();
  const t = translator(language);
  const groups = experimentGroups(language);
  const { dateFormat, monthFormat } = useMemo(
    () => ({
      dateFormat: new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Tokyo",
      }),
      monthFormat: new Intl.DateTimeFormat(language, {
        year: "numeric",
        month: "short",
        timeZone: "Asia/Tokyo",
      }),
    }),
    [language],
  );
  const reenter = t(
    "結果・ダウンロード / 再入室",
    "结果下载 / 重新入室",
    "Results / Re-enter",
  );
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
    setMessage(room.code);
    setDeleting(null);
  }

  const entries = (rooms ?? []).map((room) => {
    const experimentName = EXPERIMENT_CATALOG[room.experiment].title;
    const group = groups[room.experiment];
    const variantName = room.variant && group?.variants[room.variant];
    return {
      room,
      createdMonth: monthKey.format(room.createdAt),
      experimentName,
      experimentLabel:
        group && variantName
          ? `${group.name} · ${variantName}`
          : experimentName,
    };
  });
  const months = [
    ...new Set([month, ...entries.map((entry) => entry.createdMonth)]),
  ]
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const normalizedQuery = query.trim().toLocaleLowerCase(language);
  const filtered = entries.filter(
    ({ room, createdMonth, experimentName, experimentLabel }) =>
      (!normalizedQuery ||
        `${room.title} ${room.code} ${experimentName} ${experimentLabel}`
          .toLocaleLowerCase(language)
          .includes(normalizedQuery)) &&
      (!experiment ||
        room.experiment === experiment ||
        `${room.experiment}:${room.variant}` === experiment) &&
      (!month || createdMonth === month) &&
      (!phase || room.phase === phase),
  );

  return (
    <section
      className="teacher-rooms"
      aria-labelledby="teacher-rooms-title"
      lang={language}
    >
      <div className="teacher-rooms-heading">
        <h2 id="teacher-rooms-title">
          {t("ルーム管理", "房间管理", "Room management")}
        </h2>
        <button
          className="button secondary small-button"
          disabled={pending || !status.ready}
          onClick={() => void load()}
        >
          <RefreshCw size={14} />
          {t("更新", "刷新", "Refresh")}
        </button>
      </div>

      {!status.ready && (
        <p className="error-message" role="alert">
          {t(
            "アプリの接続設定が完了していません。管理者がデータベースと教員用キーを設定してください。",
            "连接尚未配置。请管理员设置数据库和教师密钥。",
            "Connection setup is incomplete. Ask the administrator to configure the database and teacher key.",
          )}
        </p>
      )}
      {error && (
        <p className="error-message" role="alert" lang="ja">
          {error}
        </p>
      )}
      {message && (
        <p className="teacher-rooms-message" role="status">
          {t(
            `ルーム ${message} を削除しました。`,
            `已删除房间 ${message}。`,
            `Room ${message} was deleted.`,
          )}
        </p>
      )}
      {rooms !== null && (
        <>
          <search
            className="teacher-room-filters"
            aria-label={t("ルームの絞り込み", "筛选房间", "Filter rooms")}
          >
            <label className="field teacher-room-search">
              {t(
                "実験名・ルームコード",
                "实验名或房间代码",
                "Experiment name or room code",
              )}
              <span>
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  placeholder={t(
                    "名前またはコードで検索",
                    "搜索名称或代码",
                    "Search by name or code",
                  )}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setLimit(20);
                  }}
                />
              </span>
            </label>
            <label className="field teacher-room-experiment-filter">
              {t("実験", "实验", "Experiment")}
              <select
                value={experiment}
                onChange={(event) => {
                  setExperiment(event.target.value);
                  setLimit(20);
                }}
              >
                <option value="">
                  {t("すべての実験", "所有实验", "All experiments")}
                </option>
                {Object.entries(EXPERIMENT_CATALOG).map(
                  ([value, { title }]) => {
                    const group = groups[value];
                    return group ? (
                      <optgroup key={value} label={group.name}>
                        <option value={value}>
                          {t(
                            `${group.name}（すべて）`,
                            `${group.name}（全部）`,
                            `All ${group.name}`,
                          )}
                        </option>
                        {Object.entries(group.variants).map(
                          ([variant, name]) => (
                            <option key={variant} value={`${value}:${variant}`}>
                              {name}
                            </option>
                          ),
                        )}
                      </optgroup>
                    ) : (
                      <option key={value} value={value}>
                        {title}
                      </option>
                    );
                  },
                )}
              </select>
            </label>
            <label className="field">
              {t("作成月", "创建月份", "Created month")}
              <select
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  setLimit(20);
                }}
              >
                <option value="">
                  {t("すべての月", "所有月份", "All months")}
                </option>
                {months.map((value) => (
                  <option key={value} value={value}>
                    {monthFormat.format(new Date(`${value}-01T12:00:00+09:00`))}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {t("状態", "状态", "Status")}
              <select
                value={phase}
                onChange={(event) => {
                  setPhase(event.target.value);
                  setLimit(20);
                }}
              >
                <option value="">
                  {t("すべての状態", "所有状态", "All statuses")}
                </option>
                {Object.entries(PHASE_LABELS).map(([value, labels]) => (
                  <option key={value} value={value}>
                    {t(...labels)}
                  </option>
                ))}
              </select>
            </label>
          </search>
          <p className="teacher-room-count" role="status">
            {t(
              `${filtered.length}件 / 全${rooms.length}件 · 新しい順`,
              `${filtered.length} / ${rooms.length} 间 · 最新优先`,
              `${filtered.length} of ${rooms.length} · Newest first`,
            )}
          </p>
          {filtered.length === 0 ? (
            <p className="teacher-rooms-empty">
              {rooms.length
                ? t(
                    "条件に一致するルームはありません。",
                    "没有符合条件的房间。",
                    "No rooms match these filters.",
                  )
                : t(
                    "保存済みのルームはありません。",
                    "没有已保存的房间。",
                    "No saved rooms.",
                  )}
            </p>
          ) : (
            <ul className="teacher-room-list">
              {filtered.slice(0, limit).map(({ room, experimentLabel }) => (
                <li className="teacher-room-card" key={room.code}>
                  <div className="teacher-room-card-heading">
                    <span className="teacher-room-experiment">
                      {experimentLabel}
                    </span>
                    <span className={`teacher-room-status is-${room.phase}`}>
                      {t(...PHASE_LABELS[room.phase])}
                    </span>
                  </div>
                  <h3>{room.title}</h3>
                  <div className="teacher-room-meta">
                    <span className="teacher-room-code">{room.code}</span>
                    <span>
                      {t("作成", "创建于", "Created")}{" "}
                      {dateFormat.format(room.createdAt)}
                    </span>
                    <span>
                      {room.experiment !== "judgment" &&
                        (room.experiment === "evolution"
                          ? t(
                              `${room.marketCount}グループ`,
                              `${room.marketCount} 组`,
                              `Groups ${room.marketCount}`,
                            )
                          : t(
                              `${room.marketCount}市場`,
                              `${room.marketCount} 个市场`,
                              `Markets ${room.marketCount}`,
                            ))}
                      {room.experiment !== "judgment" && " · "}
                      {t("参加者", "参与者", "Participants")}{" "}
                      {room.participantCount}
                      {!room.flexibleAdmission && `/${room.capacity}`}
                      {language === "ja" && "人"}
                    </span>
                    <span>
                      {room.experiment === "judgment" ? (
                        t(
                          `実施 ${room.round}回`,
                          `已实施 ${room.round} 次`,
                          `Sessions ${room.round}`,
                        )
                      ) : (
                        <>
                          {room.experiment === "institutions"
                            ? t(
                                `第${room.round}/${room.totalRounds}期`,
                                `第 ${room.round}/${room.totalRounds} 期`,
                                `Period ${room.round}/${room.totalRounds}`,
                              )
                            : t(
                                `第${room.round}/${room.totalRounds}ラウンド`,
                                `第 ${room.round}/${room.totalRounds} 轮`,
                                `Round ${room.round}/${room.totalRounds}`,
                              )}
                        </>
                      )}
                    </span>
                  </div>
                  {room.experiment === "institutions" && (
                    <div className="teacher-room-institutions">
                      {room.institutions.length ? (
                        room.institutions.map(({ institution, periods }) => (
                          <span key={institution}>
                            {INSTITUTIONS[institution].short}{" "}
                            {t(
                              `${periods}期`,
                              `${periods} 期`,
                              `${periods} periods`,
                            )}
                          </span>
                        ))
                      ) : (
                        <span>
                          {t(
                            `旧版 CDA ${room.totalRounds}期`,
                            `旧版 CDA ${room.totalRounds} 期`,
                            `Legacy CDA ${room.totalRounds} periods`,
                          )}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="teacher-room-actions">
                    <Link
                      className="button secondary small-button"
                      href={teacherReentryHref(room.code)}
                      aria-label={`${reenter} (${room.code})`}
                    >
                      {reenter}
                    </Link>
                    <button
                      className="button secondary small-button danger-text"
                      onClick={() => {
                        setMessage("");
                        setDeleting(room);
                      }}
                      aria-label={t(
                        `${room.code} を削除`,
                        `删除 ${room.code}`,
                        `Delete ${room.code}`,
                      )}
                    >
                      <Trash2 size={14} /> {t("削除", "删除", "Delete")}
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
              {t("次の20件を表示", "显示接下来 20 间", "Show the next 20")}
            </button>
          )}
        </>
      )}
      {pending && (
        <p className="teacher-rooms-loading" role="status">
          <Spinner />{" "}
          {t("ルームを読み込み中…", "正在读取房间…", "Loading rooms…")}
        </p>
      )}
      {status.mode === "local" && (
        <p className="local-note">
          <FlaskConical size={14} />
          {t(
            "このコンピューターに保存されたルームを表示しています。",
            "显示保存在此电脑上的房间。",
            "Showing rooms saved on this computer.",
          )}
        </p>
      )}
      {deleting && (
        <DeleteRoomDialog
          room={deleting}
          language={language}
          onCancel={() => setDeleting(null)}
          onDelete={() => remove(deleting)}
        />
      )}
    </section>
  );
}

function DeleteRoomDialog({
  room,
  language,
  onCancel,
  onDelete,
}: {
  room: RoomSummary;
  language: UiLanguage;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const t = translator(language);
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
      lang={language}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id="room-delete-title">
        {t(
          `ルーム ${room.code} を削除しますか？`,
          `删除房间 ${room.code}？`,
          `Delete room ${room.code}?`,
        )}
      </h2>
      <p className="teacher-room-delete-name">{room.title}</p>
      <p id="room-delete-description">
        {room.phase !== "waiting" &&
          room.phase !== "finished" &&
          t(
            "実験中の参加者は、このルームを利用できなくなります。",
            "正在实验的参与者将无法继续使用该房间。",
            "Participants in the experiment will lose access to the room. ",
          )}
        {t(
          "参加者情報・取引履歴・実験結果もすべて削除されます。この操作は取り消せません。必要な結果は再入室してダウンロードしてください。",
          "参与者信息、交易记录和实验结果都会永久删除。请先重新入室下载所需结果。",
          "Participant information, trade history, and results will be permanently deleted. Re-enter the room to download any results you need.",
        )}
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
          <p className="error-message" role="alert" lang="ja">
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
            {t("戻る", "返回", "Back")}
          </button>
          <button
            className="button teacher-room-delete-button"
            disabled={pending}
          >
            {pending
              ? t("削除中…", "正在删除…", "Deleting…")
              : t("このルームを削除", "删除此房间", "Delete this room")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
