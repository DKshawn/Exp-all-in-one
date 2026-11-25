import { translator, type UiLanguage } from "@/lib/ui-language";

export function TeacherPasswordHelp({
  language = "ja",
}: {
  language?: UiLanguage;
}) {
  const t = translator(language);
  return (
    <span className="field-help">
      {t(
        "再入室に使います。学生には共有しないでください。",
        "此密码用于教师重新入室，请勿与学生分享。",
        "Use this password to re-enter the room. Keep it private from students.",
      )}
    </span>
  );
}
