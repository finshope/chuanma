import { WebSocketServer } from "ws";

const PORT = Number(process.env.MAHJONG_ROOM_PORT || 8788);
const HOST = process.env.MAHJONG_ROOM_HOST || "127.0.0.1";
const SUITS = ["Man", "Pin", "Sou"];
const SUIT_NAMES = { Man: "万", Pin: "筒", Sou: "条" };
const rooms = new Map();
const sessions = new Map();

const makeCode = () => {
  let code = "";
  do code = String(Math.floor(100000 + Math.random() * 900000));
  while (rooms.has(code));
  return code;
};

const tileSuit = (tile) => tile.slice(0, 3);
const tileRank = (tile) => Number(tile.slice(3));
const tileIndex = (tile) => SUITS.indexOf(tileSuit(tile)) * 9 + tileRank(tile) - 1;
const sortTiles = (tiles) => tiles.sort((a, b) => tileIndex(a) - tileIndex(b));

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) deck.push(`${suit}${rank}`);
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function canFormMelds(counts) {
  const first = counts.findIndex((count) => count > 0);
  if (first === -1) return true;
  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (canFormMelds(counts)) {
      counts[first] += 3;
      return true;
    }
    counts[first] += 3;
  }
  const rank = first % 9;
  if (rank <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    counts[first] -= 1;
    counts[first + 1] -= 1;
    counts[first + 2] -= 1;
    if (canFormMelds(counts)) {
      counts[first] += 1;
      counts[first + 1] += 1;
      counts[first + 2] += 1;
      return true;
    }
    counts[first] += 1;
    counts[first + 1] += 1;
    counts[first + 2] += 1;
  }
  return false;
}

function isWinningHand(hand, voidSuit) {
  if (hand.length % 3 !== 2 || hand.some((tile) => tileSuit(tile) === voidSuit)) return false;
  const counts = Array(27).fill(0);
  hand.forEach((tile) => { counts[tileIndex(tile)] += 1; });
  if (hand.length === 14 && counts.every((count) => count === 0 || count === 2)) return true;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= 2) {
      counts[i] -= 2;
      if (canFormMelds(counts)) {
        counts[i] += 2;
        return true;
      }
      counts[i] += 2;
    }
  }
  return false;
}

function tileCounts(tiles) {
  const counts = new Map();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) || 0) + 1);
  return counts;
}

function isSevenPairsShape(hand) {
  if (hand.length !== 14) return false;
  return [...tileCounts(hand).values()].every((count) => count % 2 === 0);
}

function isAllTripletsShape(hand) {
  if (hand.length % 3 !== 2) return false;
  const counts = tileCounts(hand);
  for (const [pair, count] of counts) {
    if (count < 2) continue;
    counts.set(pair, count - 2);
    const allTriplets = [...counts.values()].every((remaining) => remaining % 3 === 0);
    counts.set(pair, count);
    if (allTriplets) return true;
  }
  return false;
}

function evaluateFan(player, selfDraw) {
  const concealed = player.hand;
  const exposed = player.melds.flatMap((meld) => meld.tiles);
  const allTiles = [...concealed, ...exposed];
  const patterns = [];
  const sevenPairs = player.melds.length === 0 && isSevenPairsShape(concealed);
  const concealedCounts = tileCounts(concealed);
  const longSevenPairs = sevenPairs && [...concealedCounts.values()].some((count) => count === 4);

  if (longSevenPairs) patterns.push({ name: "龙七对", fan: 3 });
  else if (sevenPairs) patterns.push({ name: "七对", fan: 2 });
  else if (isAllTripletsShape(concealed)) patterns.push({ name: "碰碰胡", fan: 1 });

  const suits = new Set(allTiles.map(tileSuit));
  if (allTiles.length > 0 && suits.size === 1) patterns.push({ name: "清一色", fan: 2 });
  if (concealed.length === 2 && player.melds.length === 4) patterns.push({ name: "金钩钓", fan: 1 });

  const roots = [...tileCounts(allTiles).values()].filter((count) => count >= 4).length;
  if (roots > 0 && !longSevenPairs) patterns.push({ name: roots === 1 ? "根" : `${roots}根`, fan: roots });
  if (selfDraw) patterns.push({ name: "自摸", fan: 1 });
  if (!patterns.some((pattern) => !["自摸", "根"].includes(pattern.name) && !pattern.name.endsWith("根"))) {
    patterns.unshift({ name: "平胡", fan: 0 });
  }

  const rawFan = patterns.reduce((sum, pattern) => sum + pattern.fan, 0);
  const fan = rawFan;
  return { patterns, rawFan, fan, multiplier: 2 ** fan };
}

function countTile(hand, tile) {
  return hand.reduce((count, current) => count + Number(current === tile), 0);
}

function removeTiles(hand, tiles) {
  const copy = [...hand];
  for (const tile of tiles) {
    const index = copy.indexOf(tile);
    if (index < 0) return null;
    copy.splice(index, 1);
  }
  return copy;
}

function chooseExchange(hand) {
  const groups = SUITS.map((suit) => ({ suit, tiles: hand.filter((tile) => tileSuit(tile) === suit) }))
    .filter((group) => group.tiles.length >= 3)
    .sort((a, b) => a.tiles.length - b.tiles.length);
  return groups[0].tiles.slice(0, 3);
}

function chooseVoid(hand) {
  const counts = SUITS.map((suit) => ({ suit, count: hand.filter((tile) => tileSuit(tile) === suit).length }));
  counts.sort((a, b) => a.count - b.count);
  return counts[0].suit;
}

function nextActiveSeat(room, fromSeat) {
  for (let offset = 1; offset <= 4; offset += 1) {
    const seat = (fromSeat + offset) % 4;
    const player = room.players.find((item) => item.seat === seat);
    if (player && !player.hasWon) return seat;
  }
  return fromSeat;
}

function activePlayers(room) {
  return room.players.filter((player) => !player.hasWon);
}

function makePlayer(id, name, seat, bot = false) {
  return {
    id,
    name: String(name || "牌友").slice(0, 10),
    seat,
    bot,
    online: true,
    ready: bot,
    score: 10000,
    hand: [],
    hasDrawnTile: false,
    melds: [],
    voidSuit: null,
    hasWon: false,
    winningTile: null,
    winningFan: null,
  };
}

function makeRoom(code, hostId) {
  return {
    code,
    hostId,
    status: "lobby",
    round: 1,
    maxRounds: 8,
    base: 2,
    players: [],
    deck: [],
    dice: [5, 2],
    wallBreakSeat: 2,
    wallBreakStack: 2,
    dealStage: null,
    dealStep: 0,
    dealSeat: null,
    discards: [[], [], [], []],
    turn: 0,
    dealer: 0,
    exchangeDirection: null,
    exchangeSubmissions: {},
    voidChoices: {},
    pendingAction: null,
    selfActions: null,
    lastAction: "等待牌友入座",
    actionAt: Date.now(),
    chat: [{ id: 1, name: "牌桌", text: "文明游戏，祝大家手气旺。" }],
    timer: null,
    result: null,
    settlements: [],
  };
}

function publicState(room, selfId) {
  const self = room.players.find((player) => player.id === selfId);
  const pendingCandidate = room.pendingAction?.candidates?.[room.pendingAction.index];
  let availableActions = [];
  if (pendingCandidate?.seat === self?.seat) availableActions = pendingCandidate.actions;
  if (room.selfActions?.seat === self?.seat) availableActions = room.selfActions.actions;
  if (availableActions.length) availableActions = ["pass", ...availableActions];

  return {
    type: "state",
    selfId,
    roomCode: room.code,
    hostId: room.hostId,
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    base: room.base,
    dealer: room.dealer,
    turn: room.turn,
    deckCount: room.deck.length,
    dice: room.dice,
    wallBreakSeat: room.wallBreakSeat,
    wallBreakStack: room.wallBreakStack,
    dealStage: room.dealStage,
    dealStep: room.dealStep,
    dealSeat: room.dealSeat,
    exchangeDirection: room.exchangeDirection,
    exchangeSubmitted: self ? Object.hasOwn(room.exchangeSubmissions, self.seat) : false,
    exchangeSelectionCount: self && Object.hasOwn(room.exchangeSubmissions, self.seat) ? room.exchangeSubmissions[self.seat].length : 0,
    lastAction: room.lastAction,
    actionAt: room.actionAt,
    availableActions,
    pendingTile: room.pendingAction?.tile || null,
    pendingDiscarderSeat: room.pendingAction?.discarder ?? null,
    hand: self?.hand || [],
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      seat: player.seat,
      bot: player.bot,
      online: player.online,
      ready: player.ready,
      score: player.score,
      handCount: player.hand.length,
      hasDrawnTile: player.hasDrawnTile,
      melds: player.melds,
      voidSuit: player.voidSuit,
      hasWon: player.hasWon,
      winningTile: player.winningTile,
      winningFan: player.winningFan,
    })),
    discards: room.discards,
    chat: room.chat,
    result: room.result,
    settlements: room.settlements,
  };
}

function safeSend(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcast(room) {
  for (const [ws, session] of sessions) {
    if (session.roomCode === room.code) safeSend(ws, publicState(room, session.clientId));
  }
}

function sendError(ws, message) {
  safeSend(ws, { type: "error", message });
}

function schedule(room, callback, delay = 650) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    room.timer = null;
    callback();
  }, delay);
}

function fillBots(room) {
  const botNames = ["锦城夜雨", "茶馆老周", "宽窄巷子"];
  while (room.players.length < 4) {
    const seat = [0, 1, 2, 3].find((value) => !room.players.some((player) => player.seat === value));
    const name = botNames.shift() || `牌友${seat + 1}`;
    room.players.push(makePlayer(`bot-${room.code}-${seat}`, name, seat, true));
  }
}

function initialDealSteps(dealer) {
  const seats = Array.from({ length: 4 }, (_, offset) => (dealer + offset) % 4);
  const steps = [];
  for (let round = 0; round < 3; round += 1) {
    for (const seat of seats) steps.push({ seat, count: 4, round, kind: "stacks" });
  }
  steps.push({ seat: dealer, count: 2, round: 3, kind: "jump" });
  for (const seat of seats.slice(1)) steps.push({ seat, count: 1, round: 3, kind: "single" });
  return steps;
}

function finishInitialDeal(room) {
  if (room.status !== "dealing") return;
  room.players.forEach((player) => {
    sortTiles(player.hand);
    player.hasDrawnTile = false;
  });
  room.status = "exchange";
  room.dealStage = null;
  room.dealSeat = null;
  room.exchangeDirection = ["顺时针", "逆时针", "对家"][(Date.now() + Number(room.code)) % 3];
  for (const player of room.players.filter((item) => item.bot)) room.exchangeSubmissions[player.seat] = chooseExchange(player.hand);
  room.lastAction = "自由换牌：可选择 0 至 3 张同花色牌，也可不换";
  room.actionAt = Date.now();
  broadcast(room);
  completeExchange(room);
}

function runInitialDeal(room, index = 0) {
  if (room.status !== "dealing") return;
  const steps = initialDealSteps(room.dealer);
  if (index >= steps.length) return finishInitialDeal(room);
  const step = steps[index];
  const player = room.players.find((item) => item.seat === step.seat);
  const tiles = room.deck.splice(0, step.count);
  player.hand.push(...tiles);
  room.dealStage = "dealing";
  room.dealStep = index + 1;
  room.dealSeat = step.seat;
  room.lastAction = step.kind === "jump"
    ? `${player.name} 跳牌取两张`
    : step.kind === "single"
      ? `${player.name} 补一张`
      : `第 ${step.round + 1} 轮 · ${player.name} 抓两墩`;
  room.actionAt = Date.now();
  broadcast(room);
  schedule(room, () => runInitialDeal(room, index + 1), 220);
}

function beginGame(room) {
  fillBots(room);
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  room.status = "dealing";
  room.deck = createDeck();
  room.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  const diceTotal = room.dice[0] + room.dice[1];
  room.wallBreakSeat = (room.dealer + ((diceTotal - 1) % 4)) % 4;
  room.wallBreakStack = Math.min(...room.dice);
  room.dealStage = "rolling";
  room.dealStep = 0;
  room.dealSeat = room.dealer;
  room.discards = [[], [], [], []];
  room.exchangeSubmissions = {};
  room.voidChoices = {};
  room.pendingAction = null;
  room.selfActions = null;
  room.result = null;
  room.settlements = [];
  room.players.forEach((player) => {
    player.hand = [];
    player.hasDrawnTile = false;
    player.melds = [];
    player.voidSuit = null;
    player.hasWon = false;
    player.winningTile = null;
    player.winningFan = null;
  });
  const dealer = room.players.find((player) => player.seat === room.dealer);
  room.lastAction = `${dealer.name} 掷骰开牌`;
  room.actionAt = Date.now();
  broadcast(room);
  schedule(room, () => {
    if (room.status !== "dealing") return;
    const breakPlayer = room.players.find((player) => player.seat === room.wallBreakSeat);
    room.dealStage = "opening";
    room.dealSeat = null;
    room.lastAction = `${breakPlayer.name} 门前开牌 · 留 ${room.wallBreakStack} 墩`;
    room.actionAt = Date.now();
    broadcast(room);
    schedule(room, () => runInitialDeal(room), 900);
  }, 1000);
}

function completeExchange(room) {
  if (Object.keys(room.exchangeSubmissions).length !== 4) return;
  const playersBySeat = [...room.players].sort((a, b) => a.seat - b.seat);
  const outgoing = new Map(playersBySeat.map((player) => [player.seat, [...room.exchangeSubmissions[player.seat]]]));
  const incoming = new Map(playersBySeat.map((player) => [player.seat, []]));

  for (const player of playersBySeat) player.hand = removeTiles(player.hand, outgoing.get(player.seat));

  // Optional exchange counts cannot use one fixed four-seat offset: a player
  // choosing zero cards must not change anybody else's hand size. Rotate each
  // of the three possible card layers only among players who selected it.
  for (let layer = 0; layer < 3; layer += 1) {
    const participants = playersBySeat.filter((player) => outgoing.get(player.seat).length > layer);
    if (!participants.length) continue;
    const sourceStep = room.exchangeDirection === "顺时针"
      ? -1
      : room.exchangeDirection === "逆时针"
        ? 1
        : Math.max(1, Math.floor(participants.length / 2));
    for (let index = 0; index < participants.length; index += 1) {
      const recipient = participants[index];
      const sourceIndex = (index + sourceStep + participants.length) % participants.length;
      const source = participants[sourceIndex];
      incoming.get(recipient.seat).push(outgoing.get(source.seat)[layer]);
    }
  }

  for (const player of playersBySeat) {
    player.hand.push(...incoming.get(player.seat));
    sortTiles(player.hand);
  }
  room.status = "void";
  for (const player of room.players.filter((item) => item.bot)) {
    player.voidSuit = chooseVoid(player.hand);
    room.voidChoices[player.seat] = player.voidSuit;
  }
  room.lastAction = `换牌完成（${room.exchangeDirection}），请选择定缺花色`;
  room.actionAt = Date.now();
  broadcast(room);
  completeVoid(room);
}

function completeVoid(room) {
  if (Object.keys(room.voidChoices).length !== 4) return;
  room.status = "play";
  room.turn = room.dealer;
  room.lastAction = "定缺完成，庄家先出牌";
  room.actionAt = Date.now();
  prepareTurn(room, true);
}

function finishGame(room, reason) {
  room.status = "finished";
  room.pendingAction = null;
  room.selfActions = null;
  const standings = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({ id: player.id, name: player.name, score: player.score, rank: index + 1, hasWon: player.hasWon, winningFan: player.winningFan }));
  room.result = { reason, standings, settlements: room.settlements };
  room.lastAction = reason;
  room.actionAt = Date.now();
  broadcast(room);
}

function settleWin(room, winner, type, payers) {
  const fanInfo = evaluateFan(winner, type === "自摸");
  const perPayer = room.base * fanInfo.multiplier;
  const total = perPayer * payers.length;

  for (const payer of payers) payer.score -= perPayer;
  winner.score += total;
  winner.winningFan = fanInfo.fan;

  const now = Date.now();
  const settlement = {
    id: `${now}-${winner.seat}-${room.settlements.length}`,
    at: now,
    winnerId: winner.id,
    winnerName: winner.name,
    type,
    loserNames: payers.map((payer) => payer.name),
    patterns: fanInfo.patterns,
    fan: fanInfo.fan,
    rawFan: fanInfo.rawFan,
    multiplier: fanInfo.multiplier,
    base: room.base,
    perPayer,
    total,
  };
  room.settlements.push(settlement);
  return settlement;
}

function findSelfGang(player) {
  const counts = new Map();
  for (const tile of player.hand) counts.set(tile, (counts.get(tile) || 0) + 1);
  return [...counts.entries()].find(([tile, count]) => count === 4 && tileSuit(tile) !== player.voidSuit)?.[0] || null;
}

function prepareTurn(room, keepCurrentHand = false) {
  if (room.status !== "play") return;
  if (activePlayers(room).length <= 1) return finishGame(room, "血战结束，三家已经胡牌");
  let player = room.players.find((item) => item.seat === room.turn);
  if (!player || player.hasWon) {
    room.turn = nextActiveSeat(room, room.turn);
    player = room.players.find((item) => item.seat === room.turn);
  }
  if (!keepCurrentHand && player.hand.length % 3 === 1) {
    const drawn = room.deck.shift();
    if (!drawn) return finishGame(room, "牌墙已摸完，本局流局");
    player.hand.push(drawn);
    player.hasDrawnTile = true;
    room.lastAction = `${player.name} 摸了一张牌`;
    room.actionAt = Date.now();
  }
  const actions = [];
  if (isWinningHand(player.hand, player.voidSuit)) actions.push("hu");
  if (findSelfGang(player)) actions.push("gang");
  room.selfActions = actions.length ? { seat: player.seat, actions } : null;
  broadcast(room);
  if (player.bot) schedule(room, () => botTurn(room, player));
}

function chooseBotDiscard(player) {
  const voidTiles = player.hand.filter((tile) => tileSuit(tile) === player.voidSuit);
  if (voidTiles.length) return voidTiles[voidTiles.length - 1];
  const counts = new Map();
  for (const tile of player.hand) counts.set(tile, (counts.get(tile) || 0) + 1);
  return [...player.hand]
    .sort((a, b) => (counts.get(a) - counts.get(b)) || (Math.abs(tileRank(b) - 5) - Math.abs(tileRank(a) - 5)))[0];
}

function botTurn(room, player) {
  if (room.status !== "play" || room.turn !== player.seat || player.hasWon) return;
  if (room.selfActions?.seat === player.seat && room.selfActions.actions.includes("hu")) return resolveSelfAction(room, player, "hu");
  if (room.selfActions?.seat === player.seat && room.selfActions.actions.includes("gang") && Math.random() > 0.55) return resolveSelfAction(room, player, "gang");
  discardTile(room, player, chooseBotDiscard(player));
}

function buildResponseQueue(room, discarder, tile) {
  const candidates = [];
  for (let distance = 1; distance <= 3; distance += 1) {
    const seat = (discarder.seat + distance) % 4;
    const player = room.players.find((item) => item.seat === seat);
    if (!player || player.hasWon) continue;
    const actions = [];
    if (isWinningHand([...player.hand, tile], player.voidSuit)) actions.push("hu");
    if (tileSuit(tile) !== player.voidSuit && countTile(player.hand, tile) >= 3) actions.push("gang");
    if (tileSuit(tile) !== player.voidSuit && countTile(player.hand, tile) >= 2) actions.push("peng");
    if (actions.length) candidates.push({ seat, distance, actions });
  }
  const priority = (candidate) => candidate.actions.includes("hu") ? 3 : candidate.actions.includes("gang") ? 2 : 1;
  candidates.sort((a, b) => priority(b) - priority(a) || a.distance - b.distance);
  return candidates;
}

function discardTile(room, player, tile) {
  if (room.status !== "play" || room.turn !== player.seat || room.pendingAction) return false;
  if (player.hand.length % 3 !== 2 || !player.hand.includes(tile)) return false;
  const mustDiscardVoid = player.hand.some((item) => tileSuit(item) === player.voidSuit);
  if (mustDiscardVoid && tileSuit(tile) !== player.voidSuit) return false;
  player.hand.splice(player.hand.indexOf(tile), 1);
  player.hasDrawnTile = false;
  sortTiles(player.hand);
  room.discards[player.seat].push(tile);
  room.selfActions = null;
  room.lastAction = `${player.name} 打出 ${SUIT_NAMES[tileSuit(tile)]}${tileRank(tile)}`;
  room.actionAt = Date.now();
  const candidates = buildResponseQueue(room, player, tile);
  if (candidates.length) {
    room.pendingAction = { discarder: player.seat, tile, candidates, index: 0 };
    broadcast(room);
    maybeRunBotResponse(room);
    return true;
  }
  room.turn = nextActiveSeat(room, player.seat);
  broadcast(room);
  prepareTurn(room);
  return true;
}

function maybeRunBotResponse(room) {
  const candidate = room.pendingAction?.candidates?.[room.pendingAction.index];
  if (!candidate) return advanceAfterResponses(room);
  const player = room.players.find((item) => item.seat === candidate.seat);
  if (!player?.bot) return;
  schedule(room, () => {
    const actions = candidate.actions;
    const choice = actions.includes("hu") ? "hu" : actions.includes("gang") && Math.random() > 0.45 ? "gang" : actions.includes("peng") && Math.random() > 0.4 ? "peng" : "pass";
    resolveResponse(room, player, choice);
  }, 520);
}

function advanceAfterResponses(room) {
  const discarder = room.pendingAction?.discarder;
  room.pendingAction = null;
  room.turn = nextActiveSeat(room, discarder);
  broadcast(room);
  prepareTurn(room);
}

function applyGangScore(room, player) {
  const gain = room.base * 2;
  for (const other of activePlayers(room)) {
    if (other.id === player.id) continue;
    other.score -= gain;
    player.score += gain;
  }
}

function resolveResponse(room, player, action) {
  const pending = room.pendingAction;
  const candidate = pending?.candidates?.[pending.index];
  if (!candidate || candidate.seat !== player.seat) return false;
  if (action === "pass" || !candidate.actions.includes(action)) {
    pending.index += 1;
    broadcast(room);
    maybeRunBotResponse(room);
    return true;
  }
  const tile = pending.tile;
  if (action === "hu") {
    player.hand.push(tile);
    sortTiles(player.hand);
    player.hasDrawnTile = false;
    const discarder = room.players.find((item) => item.seat === pending.discarder);
    const settlement = settleWin(room, player, "荣和", [discarder]);
    player.hasWon = true;
    player.winningTile = tile;
    room.lastAction = `${player.name} 荣和！${settlement.fan}番 ×${settlement.multiplier}，${discarder.name} 放铳`;
    room.actionAt = settlement.at;
    const remainingHu = pending.candidates.slice(pending.index + 1).filter((item) => item.actions.includes("hu"));
    if (remainingHu.length && activePlayers(room).length > 1) {
      room.pendingAction = { ...pending, candidates: remainingHu, index: 0 };
      broadcast(room);
      maybeRunBotResponse(room);
    } else {
      const fromSeat = pending.discarder;
      room.pendingAction = null;
      if (activePlayers(room).length <= 1) return finishGame(room, "血战结束，三家已经胡牌");
      room.turn = nextActiveSeat(room, fromSeat);
      broadcast(room);
      prepareTurn(room);
    }
    return true;
  }
  if (action === "peng") {
    player.hand = removeTiles(player.hand, [tile, tile]);
    player.hasDrawnTile = false;
    player.melds.push({ type: "peng", tiles: [tile, tile, tile], from: pending.discarder });
    room.pendingAction = null;
    room.turn = player.seat;
    room.lastAction = `${player.name} 碰！`;
    room.actionAt = Date.now();
    broadcast(room);
    if (player.bot) schedule(room, () => botTurn(room, player));
    return true;
  }
  if (action === "gang") {
    player.hand = removeTiles(player.hand, [tile, tile, tile]);
    player.hasDrawnTile = false;
    player.melds.push({ type: "gang", tiles: [tile, tile, tile, tile], from: pending.discarder });
    applyGangScore(room, player);
    room.pendingAction = null;
    room.turn = player.seat;
    room.lastAction = `${player.name} 刮风明杠！`;
    room.actionAt = Date.now();
    broadcast(room);
    prepareTurn(room);
    return true;
  }
  return false;
}

function resolveSelfAction(room, player, action) {
  if (room.selfActions?.seat !== player.seat) return false;
  if (action === "pass") {
    room.selfActions = null;
    broadcast(room);
    if (player.bot) schedule(room, () => botTurn(room, player));
    return true;
  }
  if (!room.selfActions.actions.includes(action)) return false;
  if (action === "hu") {
    const payers = activePlayers(room).filter((other) => other.id !== player.id);
    const settlement = settleWin(room, player, "自摸", payers);
    player.hasWon = true;
    player.winningTile = player.hand[player.hand.length - 1];
    room.selfActions = null;
    room.lastAction = `${player.name} 自摸！${settlement.fan}番 ×${settlement.multiplier}`;
    room.actionAt = settlement.at;
    if (activePlayers(room).length <= 1) return finishGame(room, "血战结束，三家已经胡牌");
    room.turn = nextActiveSeat(room, player.seat);
    broadcast(room);
    prepareTurn(room);
    return true;
  }
  if (action === "gang") {
    const tile = findSelfGang(player);
    if (!tile) return false;
    player.hand = removeTiles(player.hand, [tile, tile, tile, tile]);
    player.hasDrawnTile = false;
    player.melds.push({ type: "gang", tiles: [tile, tile, tile, tile], from: player.seat });
    applyGangScore(room, player);
    room.selfActions = null;
    room.lastAction = `${player.name} 下雨暗杠！`;
    room.actionAt = Date.now();
    broadcast(room);
    prepareTurn(room);
    return true;
  }
  return false;
}

function joinRoom(ws, { roomCode, name, clientId, create = false, quick = false }) {
  const id = String(clientId || "").slice(0, 80);
  if (!id) return sendError(ws, "无法识别本机玩家，请刷新重试");
  let code = String(roomCode || "").replace(/\D/g, "").slice(0, 6);
  if (create || quick) {
    code = makeCode();
    rooms.set(code, makeRoom(code, id));
  }
  const room = rooms.get(code);
  if (!room) return sendError(ws, "没有找到这个房间，请检查房号");
  let player = room.players.find((item) => item.id === id);
  if (!player) {
    if (room.status !== "lobby") return sendError(ws, "牌局已经开始，不能中途加入");
    if (room.players.length >= 4) return sendError(ws, "房间已经坐满了");
    const seat = [0, 1, 2, 3].find((value) => !room.players.some((item) => item.seat === value));
    player = makePlayer(id, name, seat);
    room.players.push(player);
  } else {
    player.online = true;
    if (name) player.name = String(name).slice(0, 10);
  }
  sessions.set(ws, { clientId: id, roomCode: code });
  room.lastAction = `${player.name} 进入房间`;
  room.actionAt = Date.now();
  broadcast(room);
  if (quick) beginGame(room);
}

function handleMessage(ws, raw) {
  let message;
  try { message = JSON.parse(raw.toString()); } catch { return sendError(ws, "消息格式错误"); }
  if (["create", "join", "quick"].includes(message.type)) {
    return joinRoom(ws, { ...message, create: message.type === "create", quick: message.type === "quick" });
  }
  const session = sessions.get(ws);
  const room = session && rooms.get(session.roomCode);
  const player = room?.players.find((item) => item.id === session.clientId);
  if (!room || !player) return sendError(ws, "请先进入房间");

  if (message.type === "ready" && room.status === "lobby") {
    player.ready = !player.ready;
    room.lastAction = `${player.name}${player.ready ? " 已准备" : " 取消准备"}`;
    room.actionAt = Date.now();
    return broadcast(room);
  }
  if (message.type === "start" && room.status === "lobby") {
    if (room.hostId !== player.id) return sendError(ws, "只有房主可以开局");
    return beginGame(room);
  }
  if (message.type === "exchange" && room.status === "exchange") {
    const requestedTiles = Array.isArray(message.tiles) ? message.tiles : [];
    const tiles = requestedTiles.slice(0, 3);
    const sameSuit = tiles.length <= 1 || new Set(tiles.map(tileSuit)).size === 1;
    if (requestedTiles.length > 3 || !sameSuit || !removeTiles(player.hand, tiles)) return sendError(ws, "可选择 0 至 3 张手牌，多张必须同花色");
    room.exchangeSubmissions[player.seat] = tiles;
    room.lastAction = tiles.length === 0 ? `${player.name} 选择不换` : `${player.name} 已选好换 ${tiles.length} 张`;
    room.actionAt = Date.now();
    broadcast(room);
    return completeExchange(room);
  }
  if (message.type === "void" && room.status === "void") {
    if (!SUITS.includes(message.suit)) return sendError(ws, "请选择万、筒或条作为定缺");
    player.voidSuit = message.suit;
    room.voidChoices[player.seat] = message.suit;
    room.lastAction = `${player.name} 已完成定缺`;
    room.actionAt = Date.now();
    broadcast(room);
    return completeVoid(room);
  }
  if (message.type === "discard") {
    if (!discardTile(room, player, String(message.tile))) return sendError(ws, "现在不能打出这张牌");
    return;
  }
  if (message.type === "action") {
    const action = String(message.action);
    const ok = room.pendingAction ? resolveResponse(room, player, action) : resolveSelfAction(room, player, action);
    if (!ok) sendError(ws, "这个操作当前不可用");
    return;
  }
  if (message.type === "chat") {
    const text = String(message.text || "").trim().slice(0, 40);
    if (!text) return;
    room.chat.push({ id: Date.now(), name: player.name, text });
    room.chat = room.chat.slice(-18);
    room.lastAction = `${player.name}：${text}`;
    room.actionAt = Date.now();
    return broadcast(room);
  }
  if (message.type === "restart" && room.status === "finished" && room.hostId === player.id) {
    room.round += 1;
    if (room.round > room.maxRounds) room.round = 1;
    return beginGame(room);
  }
}

const wss = new WebSocketServer({ port: PORT, host: HOST });

wss.on("connection", (ws) => {
  safeSend(ws, { type: "hello", port: PORT });
  ws.on("message", (message) => handleMessage(ws, message));
  ws.on("close", () => {
    const session = sessions.get(ws);
    sessions.delete(ws);
    if (!session) return;
    const room = rooms.get(session.roomCode);
    const player = room?.players.find((item) => item.id === session.clientId);
    if (player && !player.bot) {
      player.online = false;
      room.lastAction = `${player.name} 暂时离线`;
      room.actionAt = Date.now();
      broadcast(room);
    }
  });
});

wss.on("listening", () => console.log(`蜀牌局实时房间服务已启动：ws://${HOST}:${PORT}`));
