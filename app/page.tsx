import type { Metadata } from "next";
import GameClient from "./game-client";

export const metadata: Metadata = {
  title: "蜀牌局 · 四川麻将",
  description: "好友开房、换三张、定缺、血战到底的本地联机四川麻将。",
};

export default function Home() {
  return <GameClient />;
}
