"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  RotateCcw,
  SkipForward,
  UserRound,
  GraduationCap,
  Pause,
  Play,
} from "lucide-react";
import { DemoSession } from "@/experiments/double-auction/lib/demo";
import { INSTITUTIONS } from "@/experiments/double-auction/lib/study-rules";
import type { Role, RoomConfig } from "@/experiments/double-auction/lib/types";
import type { StudyGeneratorConfig } from "@/experiments/double-auction/lib/study-types";
import { StudyRoom } from "./study-room";
import { StudyDetailDialog } from "./study-detail-dialog";
import { studyTiming } from "@/experiments/double-auction/lib/study-timing";
import {
  studyInstitutions,
  studyMarketCounts,
  studyPeriodCount,
  studyUnits,
} from "@/experiments/double-auction/lib/study-config";

export default function DemoRoom({
  config,
  generator,
  onConfigure,
}: {
  config: RoomConfig;
  generator?: StudyGeneratorConfig;
  onConfigure: (config: RoomConfig, generator?: StudyGeneratorConfig) => void;
}) {
  const [session] = useState(
    () =>
      new DemoSession(studyInstitutions(config)[0], "buyer", Date.now(), {
        lobby: true,
        teacher: true,
        config,
        generator,
      }),
  );
  // DemoEntry mounts only in the browser. The preview supplies a same-origin
  // toolbar host before loading this iframe; ordinary /demo keeps its toolbar.
  const [controlsTarget] = useState<HTMLElement | null>(() => {
    if (typeof window === "undefined") return null;
    const id = window.frameElement?.getAttribute("data-demo-controls");
    return id ? window.parent.document.getElementById(id) : null;
  });
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const { view, now, teacher, role, institution } = state;
  const market = view.study!.market;
  const institutions = studyInstitutions(view.config);
  const counts = studyMarketCounts(view.config, market.id);
  const needsAssignment =
    view.phase === "waiting" && view.study!.lobby?.randomizedAt === null;
  useEffect(() => {
    const timer = window.setInterval(() => {
      // A presentation can sit in a background tab without losing the user's turn.
      if (!document.hidden) session.tick(250);
    }, 250);
    return () => window.clearInterval(timer);
  }, [session]);
  const skipLabel = teacher
    ? "30秒進める"
    : market.stage === "done"
      ? "30秒進める"
      : market.stage === "offer"
        ? "提示を締め切って公開"
        : market.stage === "call"
          ? "今の注文を清算"
          : market.stage === "purchase"
            ? view.config.studyPostedMechanism === "batch-bids-v1"
              ? "次の1秒清算へ"
              : "今の購入時間を終了"
            : "今期を終了";
  const toolbar = (
    <section className="demo-panel" aria-label="ひとりデモの操作">
      <div className="demo-controls">
        <div className="demo-options">
          <div className="demo-status">
            <span className={`role-tag ${teacher ? "teacher" : role}`}>
              {teacher ? "教員" : role === "buyer" ? "買い手" : "売り手"}
            </span>
          </div>
          <label className="field">
            {teacher ? "表示対象" : "あなたの役割"}
            <select
              value={teacher ? "all" : role}
              disabled={teacher || view.phase !== "waiting" || !needsAssignment}
              onChange={(e) =>
                session.reset(institution, e.target.value as Role)
              }
            >
              {teacher ? (
                <option value="all">買い手・売り手の両方</option>
              ) : (
                <>
                  <option value="buyer">買い手</option>
                  <option value="seller">売り手</option>
                </>
              )}
            </select>
          </label>
          <button className="button secondary" onClick={session.toggleTeacher}>
            {teacher ? <UserRound size={16} /> : <GraduationCap size={16} />}
            {teacher ? "学生画面を見る" : "教員画面を見る"}
          </button>
        </div>
        <div className="demo-actions">
          <button
            className="button primary"
            disabled={!["running", "paused"].includes(view.phase)}
            onClick={() =>
              void session.command(
                { type: view.phase === "paused" ? "resume" : "pause" },
                true,
              )
            }
          >
            {view.phase === "paused" ? <Play size={16} /> : <Pause size={16} />}
            {view.phase === "paused" ? "再開" : "一時停止"}
          </button>
          <button
            className="button secondary"
            disabled={
              view.phase !== "running" ||
              ["waiting", "countdown", "done"].includes(market.stage)
            }
            title={`市場${market.id}の次の期まで時間を進める`}
            onClick={() => session.skipPeriod(market.id)}
          >
            <SkipForward size={16} /> 次の期へ
          </button>
          <button
            className="button secondary"
            disabled={
              view.phase !== "running" ||
              ["countdown", "feedback"].includes(market.stage)
            }
            onClick={
              teacher || market.stage === "done"
                ? () => session.advanceTime()
                : session.skipStage
            }
          >
            <SkipForward size={16} />
            {skipLabel}
          </button>
          {!teacher &&
            role === "buyer" &&
            market.institution === "posted" &&
            !market.posted &&
            ["offer", "purchase"].includes(market.stage) && (
              <button
                className="button secondary"
                disabled={
                  view.phase !== "running" ||
                  market.activeBuyer === view.me.alias
                }
                onClick={session.skipToHuman}
              >
                自分の購入順へ進む
              </button>
            )}
          <button className="text-button" onClick={() => session.reset()}>
            <RotateCcw size={14} /> やり直す
          </button>
        </div>
      </div>
      <div className="demo-caption">
        <span className="demo-count">
          {view.config.markets}市場・あなた1人 ＋ 仮想参加者
          {view.config.capacity - 1}人
        </span>
        <p className="demo-hint">
          {needsAssignment
            ? view.study?.lobby?.admission?.status === "open"
              ? "教員画面で入室を締め切って割り当てを確認し、実験を開始してください。"
              : "教員画面で「ランダムに割り当て」を押してから、実験を開始してください。"
            : view.phase === "paused"
              ? "時計と仮想参加者を停止中です。「再開」を押すと続けられます。"
              : market.stage === "countdown"
                ? "全市場の開始まで5秒間カウントダウンします。"
                : market.stage === "feedback"
                  ? "市場全員で8秒間、最終期の結果を確認します。時間が来ると自動で進みます。"
                  : teacher
                    ? "各市場は独立して次の期へ進みます。一時停止・再開は全市場に適用されます。"
                    : view.phase === "waiting"
                      ? "割り当てが完了しました。教員画面の「実験を開始」で5秒後に取引が始まります。"
                      : market.stage === "done"
                        ? "あなたの市場の実験は終了しました。教員画面で全市場の進行状況と結果を確認できます。"
                        : market.stage === "cda"
                          ? `注文板の最良価格で取引するか、自分の希望価格を入力してください。各期${studyUnits(view.config)}単位まで取引できます。`
                          : market.stage === "call"
                            ? "希望価格を送信し、「今の注文を清算」を押すと待たずに結果を確認できます。"
                            : market.posted
                              ? view.config.studyPostedMechanism ===
                                "direct-purchase-v1"
                                ? role === "buyer"
                                  ? "売り手の提示から購入してください。取引価格は選んだ提示価格です。"
                                  : "売り手の提示価格で購入されます。約定後は次の単位の価格を提示できます。"
                                : "提示の締切後は1秒ごとに約定します。現在の1単位を注文し、約定後に次の単位の価格を入力してください。"
                              : market.stage === "offer"
                                ? role === "seller"
                                  ? "販売価格と数量を送信し、「提示を締め切って公開」を押してください。"
                                  : "「自分の購入順へ進む」を押すと、売り手の価格を見て購入できます。"
                                : role === "seller"
                                  ? "仮想の買い手が順番に購入します。「一時停止」で時計を止められます。"
                                  : `自分の順番では${studyTiming(view.config).buyerSeconds}秒以内に購入してください。「一時停止」で時計を止められます。`}
        </p>
        <StudyDetailDialog label="デモについて">
          <p>
            設定した{view.config.markets}市場・{view.config.capacity}
            人の実験を体験できます。あなた1人と仮想参加者
            {view.config.capacity - 1}
            人が入室済みです。教員画面で市場と役割をランダムに割り当て、開始すると5秒後に取引が始まります。あなた以外の参加者は自動で取引します。
          </p>
          <p className="demo-note">
            {view.study?.lobby?.admission
              ? "各市場は買い手・売り手各1人以上、両側の人数差は最大1人です。"
              : `各市場は買い手${counts.buyers}人・売り手${counts.sellers}人です。`}
            {institutions
              .map(
                (i) =>
                  `${INSTITUTIONS[i].short} ${studyPeriodCount(view.config, i)}期`,
              )
              .join("・")}
            、計{view.config.rounds}
            期を実施します。制度の順序と各段階の時間は設定に従います。各市場は終了した期から自動で次の期へ進みます。各制度の最終期は全員で8秒間の結果確認を行います。「30秒進める」で全市場の時間を進められます。教員画面でも、あなたの注文や購入は自動では行いません。取引するときは学生画面に戻ってください。
          </p>
          <p className="demo-note">
            デモ用の価値・費用を使用します。教員画面右上の「教員の管理・設定へ」から設定を変更して作成し直せます。やり直し・役割の変更・再読み込みで進行がリセットされます。仮想取引の結果は学生の収束を示すものではありません。
          </p>
          <p className="demo-note">
            <Link
              className="button secondary small-button"
              href="/demo/preview"
              target="_blank"
              rel="noopener noreferrer"
            >
              ノートPCの画面サイズでデモを試す ↗
            </Link>
          </p>
        </StudyDetailDialog>
      </div>
    </section>
  );
  return (
    <div
      className={`demo-workspace${!teacher && view.phase !== "waiting" && !view.me.withdrawnAt ? " demo-trading" : ""}`}
    >
      <StudyRoom
        key={`${state.generation}-${teacher}`}
        view={view}
        now={now}
        command={session.command}
        disabled={false}
        connected
        error={state.error}
        notice=""
        retry={() => {}}
        demo
        toolbar={
          controlsTarget ? createPortal(toolbar, controlsTarget) : toolbar
        }
        onConfigure={() =>
          onConfigure(view.config, session.getGeneratorConfig())
        }
        loadExport={session.exportData}
      />
    </div>
  );
}
