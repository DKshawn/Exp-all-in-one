import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { DemoModeBadge } from "./demo-mode-badge";
import { DemoExitLink } from "./demo-exit-link";
import {
  ExperimentLanguageSelect,
  ExperimentText,
} from "./experiment-language";
import { DEMO_SELECTION_HREF } from "@/lib/demo-navigation";

export function Brand({
  homeHref = "/",
  onHome,
  demo = false,
  icon,
}: {
  homeHref?: string;
  onHome?: () => void;
  demo?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={homeHref}
      className="brand"
      target={demo ? "_top" : undefined}
      onNavigate={
        onHome
          ? (event) => {
              event.preventDefault();
              onHome();
            }
          : undefined
      }
    >
      <span className="brand-mark" aria-hidden="true">
        {icon ?? <ArrowLeftRight size={21} />}
      </span>
      <span>
        <b>
          <ExperimentText ja="市場実験室" zh="市场实验室" en="Market Lab" />
        </b>
        {demo ? (
          <span className="sr-only">
            {" "}
            <ExperimentText
              ja="デモの実験選択"
              zh="演示实验选择"
              en="Demo selection"
            />
          </span>
        ) : (
          <span className="sr-only">
            {" "}
            <ExperimentText ja="ホーム" zh="首页" en="Home" />
          </span>
        )}
      </span>
    </Link>
  );
}

export function Header({
  children,
  leading,
  homeHref,
  onHome,
  className,
  demoLabel,
  demoExitLabel,
  demoExitHref,
  brandIcon,
  languageDisabled,
}: {
  children?: React.ReactNode;
  leading?: React.ReactNode;
  homeHref?: string;
  onHome?: () => void;
  className?: string;
  demoLabel?: string;
  demoExitLabel?: string;
  demoExitHref?: string;
  brandIcon?: React.ReactNode;
  languageDisabled?: boolean;
}) {
  return (
    <header className={`site-header${className ? ` ${className}` : ""}`}>
      <div className="header-inner">
        <div className="header-content">
          <div className="header-left">
            <Brand
              homeHref={demoLabel ? DEMO_SELECTION_HREF : homeHref}
              onHome={demoLabel ? undefined : onHome}
              demo={!!demoLabel}
              icon={brandIcon}
            />
            {demoLabel && <DemoModeBadge label={demoLabel} />}
            {leading}
          </div>
          {(children || demoLabel) && (
            <div className="header-right">
              {children}
              {demoLabel && (
                <DemoExitLink label={demoExitLabel} href={demoExitHref} />
              )}
            </div>
          )}
        </div>
        <ExperimentLanguageSelect disabled={languageDisabled} />
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <Link className="button secondary small-button" href="/guide">
        実験のルール
      </Link>
    </footer>
  );
}
export function Spinner() {
  return <span className="spinner" aria-label="読み込み中" />;
}
