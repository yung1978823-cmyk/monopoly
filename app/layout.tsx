import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "大富翁 · 每日棋盤",
  description: "第一層每日棋盤。擲一顆走，四格攻擊，戰鬥用兩顆骰。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
