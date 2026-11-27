import Link from "next/link";
import { ChartNoAxesCombined } from "lucide-react";
import { ExperimentText } from "@/components/experiment-language";
import { Header } from "@/components/shell";
import { DEMO_TEACHER_HREFS } from "@/lib/demo-navigation";

export function Shell({
  children,
  leading,
  wide = false,
  room = false,
  demo = false,
}: {
  children: React.ReactNode;
  leading?: React.ReactNode;
  wide?: boolean;
  room?: boolean;
  demo?: boolean;
}) {
  return (
    <div className="emh-app">
      <Header
        className={room ? "compact" : undefined}
        brandIcon={<ChartNoAxesCombined size={22} strokeWidth={1.7} />}
        demoLabel={demo ? "DEMOモード" : undefined}
        demoExitHref={DEMO_TEACHER_HREFS.emh}
        leading={leading}
      >
        <nav aria-label="メインナビゲーション">
          {!room && (
            <>
              <Link className="button secondary small-button" href="/">
                <ExperimentText ja="参加する" zh="参加" en="Join" />
              </Link>
              <Link className="button secondary small-button" href="/teacher">
                <ExperimentText ja="教員" zh="教师" en="Teacher" />
              </Link>
            </>
          )}
          <Link
            className="button secondary small-button"
            href="/emh/guide"
            target={room ? "_blank" : undefined}
          >
            <ExperimentText ja="ルール" zh="规则" en="Rules" />
            {room && <span className="sr-only">（新しいタブ）</span>}
          </Link>
        </nav>
      </Header>
      <main className={wide ? "container wide" : "container"}>{children}</main>
      <footer className="site-footer">
        <span>実験経済学</span>
        <span>資産市場と情報</span>
      </footer>
    </div>
  );
}
