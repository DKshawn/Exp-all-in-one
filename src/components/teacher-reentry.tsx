"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/client";
import { teacherRoomHref } from "@/lib/room-navigation";
import { TeacherPasswordHelp } from "./teacher-password-help";

export function TeacherReentry({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ code: string }>(`/api/rooms/${code}/teacher`, {
        password,
      });
      router.push(teacherRoomHref(result.code));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <form className="emh-create" method="post" onSubmit={submit}>
      <h1>教員として再入室</h1>
      <label className="field">
        ルームコード
        <input
          className="code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
          placeholder="例：K7M4PX"
          minLength={6}
          maxLength={6}
          pattern="[A-Z2-9]{6}"
          required
          autoComplete="off"
        />
      </label>
      <label className="field">
        教員パスワード
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="作成時に設定したパスワード"
          minLength={8}
          maxLength={128}
          autoComplete="current-password"
          required
        />
        <TeacherPasswordHelp />
      </label>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={busy}>
        {busy ? "確認中…" : "管理画面に入る"}
      </button>
    </form>
  );
}
