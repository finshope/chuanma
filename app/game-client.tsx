"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type Suit = "Man" | "Pin" | "Sou";
type Position = "bottom" | "right" | "top" | "left";
type Meld = { type: "peng" | "gang"; tiles: string[]; from: number };
type FanPattern = { name: string; fan: number };
type Settlement = {
  id: string;
  at: number;
  winnerId: string;
  winnerName: string;
  type: "自摸" | "荣和";
  loserNames: string[];
  patterns: FanPattern[];
  fan: number;
  rawFan: number;
  multiplier: number;
  base: number;
  perPayer: number;
  total: number;
};
type PlayerState = {
  id: string;
  name: string;
  seat: number;
  bot: boolean;
  online: boolean;
  ready: boolean;
  score: number;
  handCount: number;
  hasDrawnTile: boolean;
  melds: Meld[];
  voidSuit: Suit | null;
  hasWon: boolean;
  winningTile: string | null;
  winningFan: number | null;
};
type Snapshot = {
  selfId: string;
  roomCode: string;
  hostId: string;
  status: "lobby" | "dealing" | "exchange" | "void" | "play" | "finished";
  round: number;
  maxRounds: number;
  base: number;
  dealer: number;
  turn: number;
  deckCount: number;
  dice: [number, number];
  wallBreakSeat: number;
  wallBreakStack: number;
  dealStage: "rolling" | "opening" | "dealing" | null;
  dealStep: number;
  dealSeat: number | null;
  exchangeDirection: string | null;
  exchangeSubmitted: boolean;
  exchangeSelectionCount: number;
  lastAction: string;
  actionAt: number;
  availableActions: string[];
  pendingTile: string | null;
  pendingDiscarderSeat: number | null;
  hand: string[];
  players: PlayerState[];
  discards: string[][];
  chat: { id: number; name: string; text: string }[];
  settlements: Settlement[];
  result: { reason: string; standings: { id: string; name: string; score: number; rank: number; hasWon: boolean; winningFan: number | null }[]; settlements: Settlement[] } | null;
};

const SUIT_NAMES: Record<Suit, string> = { Man: "万", Pin: "筒", Sou: "条" };
const POSITION_ORDER: Position[] = ["bottom", "right", "top", "left"];
const LOGICAL_WIDTH = 1536;
const LOGICAL_HEIGHT = 864;
const tileSrc = (name: string) => `/tiles/${name}.png`;
const tileLabel = (name: string) => `${name.slice(3)}${SUIT_NAMES[name.slice(0, 3) as Suit]}`;

const demoPlayers: PlayerState[] = [
  { id: "demo-self", name: "我", seat: 0, bot: false, online: true, ready: true, score: 11160, handCount: 14, hasDrawnTile: true, melds: [], voidSuit: "Pin", hasWon: false, winningTile: null, winningFan: null },
  { id: "demo-right", name: "宽窄巷子", seat: 1, bot: true, online: true, ready: true, score: 10560, handCount: 7, hasDrawnTile: false, melds: [{ type: "peng", tiles: ["Pin6", "Pin6", "Pin6"], from: 2 }, { type: "peng", tiles: ["Sou7", "Sou7", "Sou7"], from: 0 }], voidSuit: "Sou", hasWon: true, winningTile: "Man5", winningFan: 2 },
  { id: "demo-top", name: "锦城夜雨", seat: 2, bot: true, online: true, ready: true, score: 12460, handCount: 10, hasDrawnTile: false, melds: [{ type: "peng", tiles: ["Sou3", "Sou3", "Sou3"], from: 3 }], voidSuit: "Man", hasWon: false, winningTile: null, winningFan: null },
  { id: "demo-left", name: "茶馆老周", seat: 3, bot: true, online: true, ready: true, score: 9820, handCount: 7, hasDrawnTile: false, melds: [{ type: "peng", tiles: ["Man7", "Man7", "Man7"], from: 0 }, { type: "peng", tiles: ["Sou4", "Sou4", "Sou4"], from: 2 }], voidSuit: "Pin", hasWon: false, winningTile: null, winningFan: null },
];

const DEMO: Snapshot = {
  selfId: "demo-self",
  roomCode: "873216",
  hostId: "demo-self",
  status: "play",
  round: 2,
  maxRounds: 8,
  base: 2,
  dealer: 1,
  turn: 2,
  deckCount: 38,
  dice: [5, 2],
  wallBreakSeat: 2,
  wallBreakStack: 2,
  dealStage: null,
  dealStep: 16,
  dealSeat: null,
  exchangeDirection: "顺时针",
  exchangeSubmitted: false,
  exchangeSelectionCount: 0,
  lastAction: "锦城夜雨 正在出牌",
  actionAt: 0,
  availableActions: ["pass", "peng", "gang", "hu"],
  pendingTile: "Man3",
  pendingDiscarderSeat: 2,
  hand: ["Man2", "Man3", "Man3", "Man4", "Man5", "Man6", "Pin2", "Pin3", "Pin5", "Pin7", "Sou2", "Sou3", "Sou4", "Sou8"],
  players: demoPlayers,
  discards: [[], ["Sou5", "Pin9", "Man8", "Pin6"], ["Pin1", "Man9", "Sou6", "Pin8", "Man1", "Man3"], ["Man7", "Pin4", "Sou1", "Sou9"]],
  chat: [{ id: 1, name: "牌桌", text: "文明游戏，祝大家手气旺。" }],
  settlements: [],
  result: null,
};

function useRealtimeRoom() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState("");
  const [toast, setToast] = useState("");
  const [name, setName] = useState("成都牌友");
  const socketRef = useRef<WebSocket | null>(null);
  const roomRef = useRef("");
  const nameRef = useRef(name);

  useEffect(() => { nameRef.current = name; }, [name]);

  useEffect(() => {
    queueMicrotask(() => {
      const storedId = sessionStorage.getItem("shupai-client-id");
      const nextId = storedId || crypto.randomUUID();
      if (!storedId) sessionStorage.setItem("shupai-client-id", nextId);
      const storedName = localStorage.getItem("shupai-name");
      if (storedName) setName(storedName);
      roomRef.current = sessionStorage.getItem("shupai-room") || "";
      setClientId(nextId);
    });
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const rawHost = window.location.hostname || "localhost";
      const host = rawHost === "::1" || rawHost === "[::1]" ? "127.0.0.1" : rawHost.includes(":") && !rawHost.startsWith("[") ? `[${rawHost}]` : rawHost;
      const socket = new WebSocket(`ws://${host}:8788`);
      socketRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        if (roomRef.current) socket.send(JSON.stringify({ type: "join", roomCode: roomRef.current, name: nameRef.current, clientId }));
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "state") {
          roomRef.current = message.roomCode;
          sessionStorage.setItem("shupai-room", message.roomCode);
          setSnapshot(message);
        }
        if (message.type === "error") {
          setToast(message.message);
          if (String(message.message).includes("没有找到")) {
            roomRef.current = "";
            sessionStorage.removeItem("shupai-room");
            setSnapshot(null);
          }
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 1300);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socketRef.current?.close();
    };
  }, [clientId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const send = useCallback((payload: Record<string, unknown>) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setToast("房间服务正在连接，请稍等");
      return;
    }
    socketRef.current.send(JSON.stringify(payload));
  }, []);

  const enter = useCallback((type: "create" | "join" | "quick", roomCode?: string) => {
    const cleanName = name.trim() || "成都牌友";
    localStorage.setItem("shupai-name", cleanName);
    send({ type, roomCode, name: cleanName, clientId });
  }, [clientId, name, send]);

  const leaveLocal = useCallback(() => {
    sessionStorage.removeItem("shupai-room");
    roomRef.current = "";
    setSnapshot(null);
  }, []);

  return { snapshot, connected, toast, setToast, name, setName, send, enter, leaveLocal };
}

function TileImage({ name, back = false }: { name?: string; back?: boolean }) {
  if (back) {
    return (
      <span className="tile-3d tile-back" role="img" aria-label="牌背">
        <span className="tile-back-face" aria-hidden="true" />
      </span>
    );
  }
  const file = back ? "Back" : name || "Back";
  return (
    <span className="tile-3d tile-face">
      <span className="tile-surface">
        {/* Public-domain Mahjong glyph assets are served locally and must keep their exact proportions. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tileSrc(file)} alt={tileLabel(file)} draggable={false} />
      </span>
      <span className="tile-front-edge" aria-hidden="true" />
      <span className="tile-green-lip" aria-hidden="true" />
    </span>
  );
}

function PlayerBadge({ player, position, active, dealer, self }: { player?: PlayerState; position: Position; active: boolean; dealer: boolean; self: boolean }) {
  if (!player) {
    return (
      <div className={`player player-${position} empty-seat`}>
        <div className="avatar">+</div>
        <div className="player-copy"><div className="player-name">等待入座</div><div className="player-score">空位</div></div>
      </div>
    );
  }
  return (
    <div className={`player player-${position}${active ? " is-active" : ""}${player.hasWon ? " has-won" : ""}`}>
      <div className={`avatar avatar-${player.seat}`} aria-hidden="true">
        {player.name.slice(0, 1)}
        {dealer && <span className="dealer">庄</span>}
        {!player.online && <span className="offline-dot" />}
      </div>
      <div className="player-copy">
        <div className="player-name">{self ? `${player.name}（我）` : player.name}{player.bot && <em>托管</em>}</div>
        <div className="player-score">{player.score.toLocaleString()}</div>
      </div>
      {player.voidSuit && <span className="void-badge">缺{SUIT_NAMES[player.voidSuit]}</span>}
      {player.hasWon && (
        <div className={`win-showcase win-showcase-${position}`} aria-label={`${player.name} 已胡，胡牌 ${player.winningTile ? tileLabel(player.winningTile) : "未知"}，${player.winningFan ?? 0} 番`}>
          <span className="win-seal">胡</span>
          {player.winningTile && <span className="win-tile"><TileImage name={player.winningTile} /></span>}
          <span className="win-copy"><strong>{player.winningTile ? tileLabel(player.winningTile) : "已胡"}</strong><small>{player.winningFan ?? 0} 番</small></span>
        </div>
      )}
      {active && <span className="turn-ring" aria-label="当前出牌玩家" />}
    </div>
  );
}

function ConcealedHand({ position, count, hasDrawnTile }: { position: Position; count: number; hasDrawnTile: boolean }) {
  if (position === "bottom" || count <= 0) return null;
  const visibleCount = Math.min(count, 14);
  return (
    <div
      className={`concealed concealed-${position}`}
      aria-label={`${count} 张手牌`}
      style={{ "--hand-count": visibleCount } as CSSProperties}
    >
      {Array.from({ length: visibleCount }, (_, index) => (
        <span className={`concealed-tile${hasDrawnTile && index === visibleCount - 1 ? " is-drawn" : ""}`} key={index}>
          <TileImage back />
        </span>
      ))}
    </div>
  );
}

function TileWall({ count, breakPosition, breakStack, dealStage }: { count: number; breakPosition: Position; breakStack: number; dealStage: Snapshot["dealStage"] }) {
  const positions: Position[] = ["top", "right", "bottom", "left"];
  const sideNames: Record<Position, string> = { top: "上方", right: "右方", bottom: "下方", left: "左方" };
  const stackCapacity: Record<Position, number> = { top: 14, right: 13, bottom: 14, left: 13 };
  // Sichuan competition dealing advances left-to-right from the opened wall.
  // On screen that continuous path is bottom -> right -> top -> left. The
  // physical DOM axes of the other three walls run in the opposite direction,
  // so their stack indices must be reversed when building the draw sequence.
  const wallOrder: Position[] = ["bottom", "right", "top", "left"];
  const stackOrder = (position: Position) => {
    const indices = Array.from({ length: stackCapacity[position] }, (_, index) => index);
    return position === "bottom" ? indices : indices.reverse();
  };
  const slots = wallOrder.flatMap((position) =>
    stackOrder(position).flatMap((stack) => [
      `${position}-${stack}-upper`,
      `${position}-${stack}-lower`,
    ]),
  );
  const wallStart = wallOrder
    .slice(0, wallOrder.indexOf(breakPosition))
    .reduce((sum, position) => sum + stackCapacity[position] * 2, 0);
  // The smaller die is the exact number of untouched stacks left before the
  // opening. Drawing starts at the following stack, not at the counted stack.
  const breakOffset = Math.max(1, Math.min(breakStack, stackCapacity[breakPosition])) * 2;
  const dealStartIndex = (wallStart + breakOffset) % slots.length;
  const remainingCount = Math.max(0, Math.min(count, slots.length));
  const drawnCount = slots.length - remainingCount;
  const liveIndex = (dealStartIndex + drawnCount) % slots.length;
  const remainingSlots = new Set(
    Array.from({ length: remainingCount }, (_, index) => slots[(liveIndex + index) % slots.length]),
  );
  const liveSlot = remainingCount > 0 ? slots[liveIndex] : "";
  const breakSlot = slots[dealStartIndex];

  return (
    <>
      {positions.map((position) => {
        const stacks = Array.from({ length: stackCapacity[position] }, (_, stack) => {
          const upper = remainingSlots.has(`${position}-${stack}-upper`);
          const lower = remainingSlots.has(`${position}-${stack}-lower`);
          return {
            upper,
            lower,
            live: dealStage !== "rolling" && liveSlot.startsWith(`${position}-${stack}-`),
            breakStart: breakSlot.startsWith(`${position}-${stack}-`),
          };
        });
        const tileCount = stacks.reduce((sum, stack) => sum + Number(stack.upper) + Number(stack.lower), 0);
        return (
        <div className={`tile-wall wall-${position}${tileCount === 0 ? " is-empty" : ""}${position === breakPosition && dealStage && dealStage !== "rolling" ? " is-break-wall" : ""}`} aria-label={`${sideNames[position]}活牌墙，${tileCount}张`} key={position}>
          {stacks.map((stack, index) => (
            <span className={`wall-stack${!stack.upper && !stack.lower ? " is-empty-stack" : ""}${stack.upper !== stack.lower ? " is-single" : ""}${stack.live ? " is-live" : ""}${stack.breakStart && dealStage && dealStage !== "rolling" ? " is-break-start" : ""}`} key={index}>
              <TileImage back />
            </span>
          ))}
        </div>
        );
      })}
    </>
  );
}

function DiscardRiver({ position, tiles, pending = false }: { position: Position; tiles: string[]; pending?: boolean }) {
  const placement = (index: number) => {
    const row = Math.floor(index / 6);
    const offset = index % 6;
    if (position === "top") return { gridColumn: 6 - offset, gridRow: 3 - row };
    if (position === "bottom") return { gridColumn: 1 + offset, gridRow: 1 + row };
    if (position === "left") return { gridColumn: 3 - row, gridRow: 1 + offset };
    return { gridColumn: 1 + row, gridRow: 6 - offset };
  };
  const visibleTiles = tiles.slice(-18);
  return (
    <div className={`river river-${position}`} aria-label="已打出的牌">
      {visibleTiles.map((name, index) => (
        <span className={`river-tile${pending && index === visibleTiles.length - 1 ? " is-pending" : ""}`} style={placement(index)} key={`${name}-${index}`}><TileImage name={name} /></span>
      ))}
    </div>
  );
}

function MeldGroup({ position, melds }: { position: Position; melds: Meld[] }) {
  if (!melds.length) return null;
  return (
    <div className={`melds melds-${position}`}>
      {melds.map((meld, meldIndex) => (
        <div className={`meld meld-${meld.type}`} key={`${meld.type}-${meldIndex}`}>
          {meld.tiles.map((name, index) => <span className="meld-tile" key={`${name}-${index}`}><TileImage name={name} /></span>)}
        </div>
      ))}
    </div>
  );
}

const DICE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DiceFace({ value }: { value: number }) {
  return (
    <span className="deal-die" aria-label={`${value} 点`}>
      {Array.from({ length: 9 }, (_, index) => <i className={DICE_PIPS[value]?.includes(index) ? "is-on" : ""} key={index} />)}
    </span>
  );
}

function OpeningSequence({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.status !== "dealing" || !snapshot.dealStage) return null;
  const total = snapshot.dice[0] + snapshot.dice[1];
  const breakPlayer = snapshot.players.find((player) => player.seat === snapshot.wallBreakSeat);
  const title = snapshot.dealStage === "rolling"
    ? "庄家掷骰"
    : snapshot.dealStage === "opening"
      ? `${breakPlayer?.name || "开牌位"}门前开牌`
      : snapshot.lastAction;
  const detail = snapshot.dealStage === "rolling"
    ? "两骰之和定方位 · 小点数定留墩"
    : snapshot.dealStage === "opening"
      ? `${snapshot.dice[0]} + ${snapshot.dice[1]} = ${total} · 左起留 ${snapshot.wallBreakStack} 墩，从下一墩起牌`
      : `开局发牌 ${snapshot.dealStep} / 16`;
  return (
    <div className={`opening-sequence opening-${snapshot.dealStage}`} role="status" aria-live="polite">
      <div className="deal-dice"><DiceFace value={snapshot.dice[0]} /><DiceFace value={snapshot.dice[1]} /></div>
      <strong>{title}</strong>
      <span>{detail}</span>
      {snapshot.dealStage === "dealing" && <div className="deal-progress"><i style={{ width: `${snapshot.dealStep / 16 * 100}%` }} /></div>}
    </div>
  );
}

function EntryPanel({ name, setName, enter, connected }: { name: string; setName: (name: string) => void; enter: (type: "create" | "join" | "quick", code?: string) => void; connected: boolean }) {
  const [code, setCode] = useState("");
  return (
    <div className="modal-layer entry-layer">
      <section className="entry-panel" aria-labelledby="entry-title">
        <div className="entry-seal">蜀</div>
        <p className="eyebrow">CHENGDU MAHJONG CLUB</p>
        <h1 id="entry-title">蜀牌局</h1>
        <p className="entry-subtitle">自由换牌 · 定缺 · 血战到底</p>
        <label>
          <span>你的称呼</span>
          <input value={name} maxLength={10} onChange={(event) => setName(event.target.value)} placeholder="输入昵称" />
        </label>
        <div className="entry-actions">
          <button className="primary-cta" type="button" onClick={() => enter("create")} disabled={!connected}>创建好友房</button>
          <button className="gold-cta" type="button" onClick={() => enter("quick")} disabled={!connected}>单人快速试玩</button>
        </div>
        <div className="join-line">
          <input inputMode="numeric" value={code} maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="输入 6 位房号" aria-label="房间号" />
          <button type="button" disabled={code.length !== 6 || !connected} onClick={() => enter("join", code)}>加入牌局</button>
        </div>
        <div className={`connect-note ${connected ? "online" : ""}`}><i />{connected ? "本地房间服务已连接" : "正在连接本地房间服务…"}</div>
      </section>
    </div>
  );
}

function LobbyPanel({ snapshot, send, copyRoom }: { snapshot: Snapshot; send: (payload: Record<string, unknown>) => void; copyRoom: () => void }) {
  const self = snapshot.players.find((player) => player.id === snapshot.selfId)!;
  const isHost = snapshot.hostId === snapshot.selfId;
  return (
    <div className="modal-layer lobby-layer">
      <section className="lobby-panel" aria-labelledby="lobby-title">
        <div className="lobby-heading">
          <div><p className="eyebrow">PRIVATE TABLE</p><h2 id="lobby-title">好友房 <strong>{snapshot.roomCode}</strong></h2></div>
          <button className="copy-button" type="button" onClick={copyRoom}>复制房号</button>
        </div>
        <div className="seat-list">
          {[0, 1, 2, 3].map((seat) => {
            const player = snapshot.players.find((item) => item.seat === seat);
            return (
              <div className={`lobby-seat${player ? " occupied" : ""}`} key={seat}>
                <span className="seat-number">{seat + 1}</span>
                <div className="lobby-avatar">{player ? player.name.slice(0, 1) : "+"}</div>
                <div><strong>{player?.name || "等待牌友"}</strong><small>{player ? player.bot ? "智能托管" : player.ready ? "已准备" : "未准备" : "可邀请加入"}</small></div>
                {player?.id === snapshot.hostId && <em>房主</em>}
              </div>
            );
          })}
        </div>
        <div className="lobby-rules"><span>血战到底</span><span>换 0–3 张</span><span>定缺</span><span>8 局 · 底分 {snapshot.base}</span></div>
        <div className="lobby-actions">
          <button className="secondary-cta" type="button" onClick={() => send({ type: "ready" })}>{self.ready ? "取消准备" : "准备"}</button>
          {isHost ? <button className="gold-cta" type="button" onClick={() => send({ type: "start" })}>补齐牌友并开局</button> : <span>等待房主开局</span>}
        </div>
      </section>
    </div>
  );
}

function PhasePrompt({ snapshot, selected, setSelected, send }: { snapshot: Snapshot; selected: number[]; setSelected: (value: number[]) => void; send: (payload: Record<string, unknown>) => void }) {
  if (snapshot.status === "exchange") {
    const selectedTiles = selected.map((index) => snapshot.hand[index]);
    const valid = selected.length <= 1 || new Set(selectedTiles.map((name) => name.slice(0, 3))).size === 1;
    const submitted = snapshot.exchangeSubmitted;
    const actionLabel = selected.length === 0 ? "不换" : `确认换 ${selected.length} 张`;
    return (
      <div className="phase-prompt exchange-prompt">
        <div>
          <span>自由换牌 · {snapshot.exchangeDirection} · {submitted ? `已选 ${snapshot.exchangeSelectionCount} 张` : `已选 ${selected.length} / 3`}</span>
          <strong>{submitted ? (snapshot.exchangeSelectionCount === 0 ? "已选择不换，等待其他玩家" : "已确认换牌，等待其他玩家") : "可选 0–3 张；多张必须同花色"}</strong>
        </div>
        <button type="button" disabled={submitted || !valid} onClick={() => { send({ type: "exchange", tiles: selectedTiles }); setSelected([]); }}>{submitted ? "已确认" : actionLabel}</button>
      </div>
    );
  }
  if (snapshot.status === "void") {
    return (
      <div className="phase-prompt void-prompt">
        <div><span>定缺</span><strong>选择本局必须先打完的花色</strong></div>
        <div className="void-actions">
          {(Object.keys(SUIT_NAMES) as Suit[]).map((suit) => <button type="button" key={suit} onClick={() => send({ type: "void", suit })}>缺 {SUIT_NAMES[suit]}</button>)}
        </div>
      </div>
    );
  }
  return null;
}

function SettlementBreakdown({ settlement }: { settlement: Settlement }) {
  return (
    <article className="settlement-row">
      <div className="settlement-heading">
        <div><strong>{settlement.winnerName}</strong><span>{settlement.type}</span></div>
        <b>{settlement.fan}<small>番</small></b>
      </div>
      <div className="fan-patterns">
        {settlement.patterns.map((pattern, index) => (
          <span key={`${pattern.name}-${index}`}>{pattern.name}<em>{pattern.fan > 0 ? `+${pattern.fan}` : "0"}番</em></span>
        ))}
      </div>
      <div className="score-formula">
        <span>单家支付</span>
        <strong>{settlement.base} × 2<sup>{settlement.fan}</sup> = {settlement.perPayer} 分</strong>
      </div>
      <p>{settlement.type === "自摸" ? `${settlement.loserNames.join("、")} 各付 ${settlement.perPayer} · 共得 ${settlement.total}` : `${settlement.loserNames.join("、")} 放铳 · 支付 ${settlement.perPayer}`}</p>
    </article>
  );
}

function FanReveal({ settlement }: { settlement?: Settlement }) {
  if (!settlement) return null;
  return (
    <div className="fan-reveal" role="status" aria-live="polite">
      <div className="fan-seal">胡</div>
      <div className="fan-reveal-copy">
        <small>{settlement.winnerName} · {settlement.type}</small>
        <strong>{settlement.fan} 番 <em>×{settlement.multiplier}</em></strong>
        <span>{settlement.patterns.map((pattern) => `${pattern.name} ${pattern.fan > 0 ? `+${pattern.fan}` : "0"}`).join(" · ")}</span>
      </div>
      <div className="fan-reveal-score"><small>单家</small><b>+{settlement.perPayer}</b></div>
    </div>
  );
}

function ResultPanel({ snapshot, send }: { snapshot: Snapshot; send: (payload: Record<string, unknown>) => void }) {
  if (snapshot.status !== "finished" || !snapshot.result) return null;
  const isHost = snapshot.hostId === snapshot.selfId;
  return (
    <div className="modal-layer result-layer">
      <section className="result-panel">
        <p className="eyebrow">ROUND COMPLETE</p>
        <h2>本局结算</h2>
        <p>{snapshot.result.reason}</p>
        <div className="settlement-ledger">
          {snapshot.result.settlements.length ? snapshot.result.settlements.map((settlement) => <SettlementBreakdown key={settlement.id} settlement={settlement} />) : <p className="empty-settlement">本局无人胡牌，未产生番数结算</p>}
        </div>
        <h3>积分排名</h3>
        <div className="standings">
          {snapshot.result.standings.map((item) => (
            <div key={item.id} className={item.id === snapshot.selfId ? "is-self" : ""}><b>{item.rank}</b><span>{item.name}{item.hasWon ? ` · ${item.winningFan ?? 0}番` : ""}</span><strong>{item.score.toLocaleString()}</strong></div>
          ))}
        </div>
        {isHost ? <button className="gold-cta" type="button" onClick={() => send({ type: "restart" })}>再来一局</button> : <span>等待房主开始下一局</span>}
      </section>
    </div>
  );
}

function RulesPanel({ close }: { close: () => void }) {
  return (
    <div className="drawer-layer">
      <button className="drawer-scrim" type="button" aria-label="关闭规则面板" onClick={close} />
      <aside className="rules-panel">
        <button className="drawer-close" type="button" onClick={close}>关闭</button>
        <p className="eyebrow">SICHUAN RULES</p>
        <h2>四川麻将规则</h2>
        <dl>
          <div><dt>自由换牌</dt><dd>开局可选择 0 至 3 张手牌；多张须为同一花色，也可以一张不选。每人拿回与自己交出数量相同的牌。</dd></div>
          <div><dt>定缺</dt><dd>选定一种花色为“缺”，必须先打完该花色才能进行其他操作或胡牌。</dd></div>
          <div><dt>血战到底</dt><dd>一家胡牌后离场，其余玩家继续，直至三家胡牌或牌墙摸完。</dd></div>
          <div><dt>刮风下雨</dt><dd>明杠称刮风，暗杠称下雨，杠牌立即结算分数。</dd></div>
          <div><dt>番数积分</dt><dd>每多一番积分翻倍：单家支付 = 底分 × 2<sup>总番数</sup>，结算会逐项列出番型、总番与实际倍数。</dd></div>
        </dl>
        <p className="asset-credit">牌面素材：FluffyStuff / riichi-mahjong-tiles（Public Domain）</p>
      </aside>
    </div>
  );
}

export default function GameClient() {
  const { snapshot, connected, toast, setToast, name, setName, send, enter, leaveLocal } = useRealtimeRoom();
  const [selected, setSelected] = useState<number[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [clock, setClock] = useState(0);
  const [scale, setScale] = useState(0);
  const state = snapshot || DEMO;
  const selfSeat = snapshot?.players.find((player) => player.id === snapshot.selfId)?.seat ?? 0;

  useEffect(() => {
    const timer = setTimeout(() => setSelected([]), 0);
    return () => clearTimeout(timer);
  }, [snapshot?.status, snapshot?.roomCode]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
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

  const positionForSeat = useCallback((seat: number) => POSITION_ORDER[(seat - selfSeat + 4) % 4], [selfSeat]);
  const playersByPosition = useMemo(() => {
    const map = new Map<Position, PlayerState>();
    state.players.forEach((player) => map.set(positionForSeat(player.seat), player));
    return map;
  }, [positionForSeat, state.players]);
  const countdown = snapshot && clock >= state.actionAt ? Math.max(0, 15 - Math.floor((clock - state.actionAt) / 1000)) : 15;
  const self = snapshot?.players.find((player) => player.id === snapshot.selfId);
  const isMyTurn = snapshot?.status === "play" && snapshot.turn === self?.seat && !snapshot.availableActions.length;
  const hasPendingDiscard = state.status === "play" && !!state.pendingTile && state.pendingDiscarderSeat !== null && state.availableActions.length > 0;
  const pendingDiscarder = hasPendingDiscard ? state.players.find((player) => player.seat === state.pendingDiscarderSeat) : undefined;
  const lastSettlement = snapshot?.settlements.at(-1);
  // The transient fan banner must not overlap the finished-round ledger. Apart
  // from obscuring the numbers, animating it over a full-screen result surface
  // forces the browser to composite two large layers at once.
  const visibleSettlement = state.status !== "finished" && lastSettlement && clock >= lastSettlement.at && clock - lastSettlement.at < 4200
    ? lastSettlement
    : undefined;

  const toggleTile = (index: number) => {
    if (snapshot?.status === "exchange") {
      setSelected((current) => current.includes(index) ? current.filter((value) => value !== index) : current.length < 3 ? [...current, index] : current);
      return;
    }
    if (isMyTurn) send({ type: "discard", tile: snapshot?.hand[index] });
  };

  const copyRoom = async () => {
    try {
      await navigator.clipboard.writeText(snapshot?.roomCode || "");
      setToast("房号已复制，可以发给牌友了");
    } catch { setToast(`房间号：${snapshot?.roomCode}`); }
  };

  const sendQuickChat = (text: string) => {
    send({ type: "chat", text });
    setChatOpen(false);
  };

  return (
    <main className="game-shell">
      <div
        className={`game-canvas${scale > 0 ? " is-ready" : ""}`}
        style={{ width: LOGICAL_WIDTH * scale, height: LOGICAL_HEIGHT * scale }}
      >
        <div className="game-scene" style={{ transform: `scale(${scale})` }}>
          <header className="topbar">
            <button className="brand brand-button" type="button" onClick={() => setRulesOpen(true)} aria-label="查看四川麻将规则">
              <span className="brand-mark">蜀</span>
              <span><strong>蜀牌局</strong><small>四川麻将 · 血战到底</small></span>
            </button>
            <button className="room-meta room-meta-button" type="button" onClick={copyRoom} disabled={!snapshot} title="复制房号">
              <strong>血流成河 · 好友房</strong>
              <span>房间：{state.roomCode}</span>
              <span>局数：{state.round}/{state.maxRounds}局</span>
              <span>底分：{state.base}</span>
            </button>
            <nav className="table-tools" aria-label="牌桌工具">
              <span className={`network-state ${connected ? "online" : ""}`}><i />{connected ? "联机" : "重连中"}</span>
              <button type="button" onClick={() => setChatOpen((value) => !value)} aria-label="快捷消息"><span>☵</span><b>消息</b></button>
              <button type="button" onClick={() => setRulesOpen(true)} aria-label="规则与设置"><span>?</span><b>规则</b></button>
              {snapshot && <button type="button" onClick={leaveLocal} aria-label="退出房间"><span>↪</span><b>退出</b></button>}
            </nav>
          </header>

          <section className="table-stage" aria-label="四川麻将牌桌">
            <div className="wood-frame">
              <div className="felt">
            <div className="felt-grain" />
            <div className="fan-rule-chip"><span>番数计分</span><strong>每番 ×2</strong><small>底分 {state.base} · 逐番翻倍</small></div>
            <button className="game-rail game-rail-left" type="button" onClick={() => setRulesOpen(true)} aria-label="打开牌局规则">
              <span>理</span><span>和</span><span>鸣</span><span>切</span><b>▶</b>
            </button>
            <button className="game-rail game-rail-right" type="button" onClick={() => setChatOpen((value) => !value)} aria-label="打开快捷消息"><span>☺</span></button>
            <TileWall
              count={state.deckCount}
              breakPosition={positionForSeat(state.wallBreakSeat ?? state.dealer)}
              breakStack={state.wallBreakStack ?? 1}
              dealStage={state.dealStage}
            />
            {POSITION_ORDER.map((position) => {
              const player = playersByPosition.get(position);
              return <PlayerBadge key={position} position={position} player={player} active={player?.seat === state.turn && state.status === "play" || player?.seat === state.dealSeat && state.status === "dealing"} dealer={player?.seat === state.dealer} self={player?.id === state.selfId} />;
            })}

            {state.players.map((player) => {
              const position = positionForSeat(player.seat);
              return <ConcealedHand key={`hand-${player.id}`} position={position} count={player.handCount} hasDrawnTile={player.hasDrawnTile} />;
            })}
            {state.players.map((player) => {
              const position = positionForSeat(player.seat);
              return <DiscardRiver key={`river-${player.id}`} position={position} tiles={state.discards[player.seat] || []} pending={hasPendingDiscard && player.seat === state.pendingDiscarderSeat} />;
            })}
            {state.players.map((player) => <MeldGroup key={`meld-${player.id}`} position={positionForSeat(player.seat)} melds={player.melds} />)}

            <OpeningSequence snapshot={state} />

            <div className="center-console">
              <div className="wind wind-top">北</div><div className="wind wind-right">西</div><div className="wind wind-bottom is-current">南</div><div className="wind wind-left">东</div>
              <div className="round-count"><small>剩余</small><strong>{state.deckCount}</strong><small>张</small></div>
              <span className="dice">{(state.dice ?? [5, 2]).map((value) => ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value - 1]).join(" ")}</span>
            </div>

            <div className="turn-notice"><span className="pulse-dot" />{state.lastAction}<strong>{state.status === "play" ? countdown : ""}</strong></div>
            {state.status === "play" && <div className="turn-timer" aria-label={`剩余操作时间 ${countdown} 秒`}><span>{String(countdown).padStart(2, "0")}</span></div>}
            <FanReveal settlement={visibleSettlement} />

            {!!snapshot?.hand.length && (
              <div className="my-hand" aria-label="你的手牌">
                <div className="hand-tiles">
                  {snapshot.hand.map((tile, index) => (
                    <button className={`hand-tile${selected.includes(index) ? " selected" : ""}${index === snapshot.hand.length - 1 && self?.hasDrawnTile ? " drawn" : ""}`} type="button" key={`${tile}-${index}`} onClick={() => toggleTile(index)} aria-label={`${selected.includes(index) ? "取消选择" : "选择"}${tileLabel(tile)}`}>
                      <TileImage name={tile} />
                    </button>
                  ))}
                </div>
                {self?.voidSuit && <div className="suit-mark">缺 {SUIT_NAMES[self.voidSuit]}</div>}
              </div>
            )}

            {state.status === "play" && (
              <div className={`actions${state.availableActions.length ? " has-actions" : ""}${hasPendingDiscard ? " has-pending-discard" : ""}`} aria-label="可用操作">
                {hasPendingDiscard && state.pendingTile && (
                  <div className="pending-discard-cue" role="status" aria-live="assertive" aria-label={`${pendingDiscarder?.name || "其他玩家"}打出${tileLabel(state.pendingTile)}，等待你的操作`}>
                    <span className="pending-discard-tile"><TileImage name={state.pendingTile} /></span>
                    <span className="pending-discard-copy"><small>{pendingDiscarder?.name || "其他玩家"}打出</small><strong>{tileLabel(state.pendingTile)}</strong><b>等待响应</b></span>
                  </div>
                )}
                {[{ key: "pass", zh: "过", en: "PASS", tone: "muted" }, { key: "peng", zh: "碰", en: "PENG", tone: "amber" }, { key: "gang", zh: "杠", en: "GANG", tone: "blue" }, { key: "hu", zh: "胡", en: "HU", tone: "red" }].map((action) => (
                  <button className={`action ${action.tone}`} type="button" key={action.key} disabled={!snapshot?.availableActions.includes(action.key)} onClick={() => send({ type: "action", action: action.key })}><strong>{action.zh}</strong><span>{action.en}</span></button>
                ))}
              </div>
            )}

            {snapshot && <PhasePrompt snapshot={snapshot} selected={selected} setSelected={setSelected} send={send} />}
            {snapshot && <ResultPanel snapshot={snapshot} send={send} />}
              </div>
            </div>
          </section>
        </div>
      </div>

      {!snapshot && <EntryPanel name={name} setName={setName} enter={enter} connected={connected} />}
      {snapshot?.status === "lobby" && <LobbyPanel snapshot={snapshot} send={send} copyRoom={copyRoom} />}
      {rulesOpen && <RulesPanel close={() => setRulesOpen(false)} />}

      {chatOpen && (
        <div className="chat-popover">
          <div className="chat-history">{state.chat.slice(-5).map((item) => <p key={item.id}><strong>{item.name}</strong>{item.text}</p>)}</div>
          <div className="quick-chat">{["大家好，手下留情！", "这牌打得巴适。", "快点噻，等到花儿都谢了。", "不好意思，手滑了。"].map((text) => <button type="button" key={text} onClick={() => sendQuickChat(text)}>{text}</button>)}</div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
