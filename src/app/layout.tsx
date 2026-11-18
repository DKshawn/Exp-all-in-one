import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "市場実験室 | 経済学実験",
  description:
    "Double Auction、資産市場実験、Judgement under Uncertainty、確率的進化ゲームに参加する授業用経済学実験アプリです。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
