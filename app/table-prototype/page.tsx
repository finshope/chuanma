"use client";

import { useEffect, useState } from "react";
import "./prototype.css";

const LOGICAL_WIDTH = 1536;
const LOGICAL_HEIGHT = 864;

type Suit = "Man" | "Pin" | "Sou";
type TileSpec =
  | { suit: Suit; value: number; label?: never; tone?: never }
  | { suit?: never; value?: never; label: string; tone: "red" | "green" | "black" };

const man = (value: number): TileSpec => ({ suit: "Man", value });
const pin = (value: number): TileSpec => ({ suit: "Pin", value });
const sou = (value: number): TileSpec => ({ suit: "Sou", value });
const honor = (label: string, tone: "red" | "green" | "black" = "black"): TileSpec => ({
  label,
  tone,
});

const localHand: TileSpec[] = [
  man(1),
  man(2),
  man(3),
  man(5),
  man(5),
  man(6),
  man(7),
  pin(4),
  pin(7),
  sou(5),
  sou(1),
  honor("東"),
  honor("南"),
  honor("中", "red"),
];

const topRiver: TileSpec[] = [
  sou(3),
  sou(1),
  sou(1),
  honor("發", "green"),
  honor("中", "red"),
  pin(6),
];
const leftRiver: TileSpec[] = [sou(3), man(1), man(3), honor("發", "green")];
const rightRiver: TileSpec[] = [
  pin(1),
  pin(6),
  man(4),
  sou(2),
  honor("中", "red"),
  honor("發", "green"),
  honor("發", "green"),
];
const bottomRiver: TileSpec[] = [honor("中", "red"), sou(7), honor("東"), honor("北")];

function FaceTile({
  tile,
  className = "",
  label,
}: {
  tile: TileSpec;
  className?: string;
  label?: string;
}) {
  const readable = "suit" in tile ? `${tile.value}${tile.suit}` : tile.label;

  return (
    <span className={`proto-tile proto-tile-face ${className}`} aria-label={label ?? readable}>
      <span className="proto-tile-surface">
        <span className="proto-tile-mark">
          {"suit" in tile ? (
            // These are the project-provided public-domain Mahjong glyph assets.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/tiles/${tile.suit}${tile.value}.png`} alt="" draggable={false} />
          ) : (
            <span className={`honor-glyph honor-${tile.tone}`}>{tile.label}</span>
          )}
        </span>
      </span>
      <span className="proto-tile-front-edge" aria-hidden="true" />
      <span className="proto-tile-green-lip" aria-hidden="true" />
    </span>
  );
}

function ConcealedTile() {
  return (
    <span className="tile-body concealed-tile" aria-hidden="true">
      <span className="concealed-back-pattern" />
    </span>
  );
}

function WallUnit() {
  return (
    <span className="tile-body wall-unit" aria-hidden="true">
      <span className="wall-back-pattern" />
    </span>
  );
}

function Wall({
  className,
  count,
}: {
  className: string;
  count: number;
}) {
  return (
    <div className={`physical-wall ${className}`} aria-label="剩余牌墙">
      {Array.from({ length: count }, (_, index) => (
        <WallUnit key={index} />
      ))}
    </div>
  );
}

function ConcealedHand({ className, count }: { className: string; count: number }) {
  return (
    <div className={`concealed-hand ${className}`} aria-label="玩家暗手">
      {Array.from({ length: count }, (_, index) => (
        <ConcealedTile key={index} />
      ))}
    </div>
  );
}

function River({
  className,
  tiles,
}: {
  className: string;
  tiles: TileSpec[];
}) {
  const direction = className.replace("river-", "");

  return (
    <div className={`discard-river ${className}`} aria-label="弃牌区">
      {tiles.map((tile, index) => (
        <span className="river-cell" key={index}>
          <FaceTile tile={tile} className={`river-tile river-tile-${direction}`} />
        </span>
      ))}
    </div>
  );
}

function PlayerPlate({
  className,
  avatar,
  name,
  score,
  wind,
  dealer = false,
}: {
  className: string;
  avatar: string;
  name: string;
  score: string;
  wind: string;
  dealer?: boolean;
}) {
  return (
    <div className={`player-plate ${className}`}>
      <div className={`portrait portrait-${avatar}`} aria-hidden="true">
        <span className="portrait-hair" />
        <span className="portrait-face" />
        <span className="portrait-neck" />
        <span className="portrait-clothes" />
        <span className="portrait-fringe" />
      </div>
      <div className="player-copy">
        <strong>{name}</strong>
        <b>{score}</b>
      </div>
      {wind && <span className={`wind-badge wind-${wind}`}>{wind}</span>}
      {dealer && <span className="dealer-badge">庄</span>}
    </div>
  );
}

function ToolButton({ icon, label }: { icon: string; label: string }) {
  return (
    <button type="button" className="round-tool" aria-label={label}>
      <span aria-hidden="true">{icon}</span>
      <b>{label}</b>
    </button>
  );
}

export default function TablePrototypePage() {
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const fitSceneToWindow = () => {
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      setScale(Math.min(viewportWidth / LOGICAL_WIDTH, viewportHeight / LOGICAL_HEIGHT));
    };

    fitSceneToWindow();
    window.addEventListener("resize", fitSceneToWindow);
    window.visualViewport?.addEventListener("resize", fitSceneToWindow);

    return () => {
      window.removeEventListener("resize", fitSceneToWindow);
      window.visualViewport?.removeEventListener("resize", fitSceneToWindow);
    };
  }, []);

  return (
    <main className="prototype-page">
      <div
        className={`prototype-canvas${scale > 0 ? " is-ready" : ""}`}
        style={{ width: LOGICAL_WIDTH * scale, height: LOGICAL_HEIGHT * scale }}
      >
      <section
        className="prototype-scene"
        aria-label="四川麻将打牌界面静态原型"
        style={{ transform: `scale(${scale})` }}
      >
        <div className="wood-grain" aria-hidden="true" />
        <div className="top-wood-rail" aria-hidden="true" />
        <div className="felt-plane" aria-hidden="true" />
        <div className="felt-noise" aria-hidden="true" />

        <aside className="match-panel">
          <strong>血流成河 · 中级场</strong>
          <span>底分：100</span>
          <span>局数：8/8局</span>
          <i aria-hidden="true" />
        </aside>

        <nav className="prototype-tools" aria-label="牌局菜单">
          <ToolButton icon="♙" label="托管" />
          <ToolButton icon="⚑" label="任务" />
          <ToolButton icon="?" label="规则" />
          <ToolButton icon="⚙" label="设置" />
        </nav>

        <PlayerPlate className="player-north" avatar="boy" name="雀友123456" score="18,900" wind="北" />
        <PlayerPlate className="player-west" avatar="violet" name="清风徐来" score="25,600" wind="万" />
        <PlayerPlate className="player-east" avatar="amber" name="胡牌小能手" score="23,100" wind="西" />
        <PlayerPlate className="player-self" avatar="blue" name="南风知我意" score="32,400" wind="" dealer />

        <ConcealedHand className="hand-north" count={7} />
        <ConcealedHand className="hand-west" count={13} />
        <ConcealedHand className="hand-east" count={13} />

        <Wall className="wall-north" count={16} />
        <Wall className="wall-west" count={14} />
        <Wall className="wall-east" count={14} />

        <River className="river-north" tiles={topRiver} />
        <River className="river-west" tiles={leftRiver} />
        <River className="river-east" tiles={rightRiver} />
        <River className="river-south" tiles={bottomRiver} />

        <div className="table-console" aria-label="中央牌局信息">
          <div className="console-bevel console-bevel-top" />
          <div className="console-bevel console-bevel-right" />
          <div className="console-bevel console-bevel-bottom" />
          <div className="console-bevel console-bevel-left" />
          <span className="score score-north">28900</span>
          <span className="score score-west">23400</span>
          <span className="score score-east">23100</span>
          <span className="console-round">08局</span>
          <strong>09</strong>
          <small>19800</small>
          <b>东</b>
        </div>

        <div className="turn-timer" aria-label="剩余操作时间 9 秒">
          <span>09</span>
        </div>

        <div className="action-row" aria-label="牌局操作">
          <button className="action action-blue" type="button">吃</button>
          <button className="action action-blue" type="button">碰</button>
          <button className="action action-blue" type="button">杠</button>
          <button className="action action-gold" type="button">胡</button>
          <button className="action action-gray" type="button">过</button>
        </div>

        <div className="local-hand" aria-label="我的手牌">
          {localHand.map((tile, index) => (
            <FaceTile
              tile={tile}
              className={index === localHand.length - 1 ? "drawn-tile" : ""}
              key={index}
            />
          ))}
        </div>

        <button className="chat-button" type="button" aria-label="快捷消息">
          <span>•••</span>
        </button>
      </section>
      </div>
    </main>
  );
}
