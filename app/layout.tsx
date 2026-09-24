import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "大富翁 · 每日棋盤",
  description: "一個人的棋盤，四個地標。擲兩顆得分數。骰子每 30 分鐘補一顆，最多存二十顆。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
