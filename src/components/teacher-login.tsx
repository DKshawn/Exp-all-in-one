"use client";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client";
import { TeacherKeyHelp } from "./teacher-key-help";

export function TeacherLogin({
  failed,
  returnTo,
  ready,
}: {
  failed: boolean;
  returnTo: string;
  ready: boolean;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    failed ? "ログインできませんでした。教員用キーを確認してください。" : "",
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/teacher/session", { accessKey: key });
      setKey("");
      // A fresh navigation also clears any previously cached unauthenticated RSC.
      window.location.assign(returnTo);
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <form
      className="panel teacher-login"
      method="post"
      action="/api/teacher/session"
      onSubmit={submit}
    >
      <input type="hidden" name="next" value={returnTo} />
      <h1>教員ログイン</h1>
      <label className="field">
        教員用キー
        <input
          type="password"
          name="accessKey"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
          maxLength={256}
          autoComplete="current-password"
          disabled={busy}
        />
        <TeacherKeyHelp />
      </label>
      {!ready && (
        <p className="error-message" role="alert">
          管理者が接続設定を完了してからログインしてください。
        </p>
      )}
      {ready && error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="button primary full"
        disabled={busy || !ready}
      >
        {busy ? "確認中…" : "ログイン"}
      </button>
    </form>
  );
}

export function TeacherLogout() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="button secondary small-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/teacher/session", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (!response.ok) throw new Error("ログアウトできませんでした。");
            // Drop previously authenticated client-route caches after logout.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/teacher/login");
          } catch (error) {
            setError(errorMessage(error));
            setBusy(false);
          }
        }}
      >
        ログアウト
      </button>
      {error && (
        <span role="alert" className="error-message">
          {error}
        </span>
      )}
    </>
  );
}
