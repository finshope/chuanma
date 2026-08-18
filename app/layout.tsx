import type { Metadata } from "next";
import "./globals.css";
import "./game-table-v2.css";

export const metadata: Metadata = {
  title: "蜀牌局 · 四川麻将",
  description: "好友开房、换三张、定缺、血战到底的本地联机四川麻将。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
