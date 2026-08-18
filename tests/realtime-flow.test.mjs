import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

function waitForMessage(socket, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for realtime state"));
    }, timeout);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    };
    socket.on("message", onMessage);
  });
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

test("two local clients can create, join, and start one room", { timeout: 18000 }, async (t) => {
  const port = 9000 + (process.pid % 500);
  const server = spawn(process.execPath, [fileURLToPath(new URL("../realtime/server.mjs", import.meta.url))], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, MAHJONG_ROOM_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Realtime server did not start")), 4000);
    server.stdout.on("data", (chunk) => {
      if (!chunk.toString().includes("实时房间服务已启动")) return;
      clearTimeout(timer);
      resolve();
    });
    server.once("exit", (code) => reject(new Error(`Realtime server exited with ${code}`)));
  });

  const host = await openSocket(`ws://127.0.0.1:${port}`);
  const hostStatePromise = waitForMessage(host, (message) => message.type === "state" && message.status === "lobby");
  host.send(JSON.stringify({ type: "create", clientId: "test-host", name: "房主" }));
  const hostState = await hostStatePromise;
  assert.equal(hostState.players.length, 1);
  assert.match(hostState.roomCode, /^\d{6}$/);

  const guest = await openSocket(`ws://127.0.0.1:${port}`);
  const guestStatePromise = waitForMessage(guest, (message) => message.type === "state" && message.players.length === 2);
  guest.send(JSON.stringify({ type: "join", roomCode: hostState.roomCode, clientId: "test-guest", name: "牌友" }));
  const guestState = await guestStatePromise;
  assert.equal(guestState.roomCode, hostState.roomCode);

  const rollingPromise = waitForMessage(host, (message) => message.type === "state" && message.status === "dealing" && message.dealStage === "rolling");
  const openingPromise = waitForMessage(host, (message) => message.type === "state" && message.dealStage === "opening", 7000);
  const firstDealPromise = waitForMessage(host, (message) => message.type === "state" && message.dealStage === "dealing" && message.dealStep === 1, 7000);
  const startedPromise = waitForMessage(host, (message) => message.type === "state" && message.status === "exchange", 12000);
  host.send(JSON.stringify({ type: "start" }));
  const rolling = await rollingPromise;
  const opening = await openingPromise;
  const firstDeal = await firstDealPromise;
  const started = await startedPromise;
  assert.equal(rolling.deckCount, 108);
  assert.equal(rolling.hand.length, 0);
  assert.equal(opening.wallBreakStack, Math.min(...opening.dice));
  assert.equal(firstDeal.deckCount, 104);
  assert.equal(firstDeal.players.reduce((sum, item) => sum + item.handCount, 0), 4);
  assert.equal(firstDeal.dealSeat, firstDeal.dealer);
  assert.equal(started.players.length, 4);
  assert.equal(started.hand.length, 14);
  assert.equal(started.deckCount, 55);
  assert.deepEqual(started.players.map((item) => item.handCount).sort((a, b) => a - b), [13, 13, 13, 14]);
  assert.ok(started.players.every((item) => item.hasDrawnTile === false));
  assert.equal(started.dice.length, 2);
  assert.ok(started.dice.every((value) => value >= 1 && value <= 6));
  assert.ok(started.wallBreakSeat >= 0 && started.wallBreakSeat <= 3);
  assert.ok(started.wallBreakStack >= 1 && started.wallBreakStack <= 6);

  const voidPromise = waitForMessage(host, (message) => message.type === "state" && message.status === "void");
  host.send(JSON.stringify({ type: "exchange", tiles: [started.hand[0]] }));
  guest.send(JSON.stringify({ type: "exchange", tiles: [] }));
  const afterOptionalExchange = await voidPromise;
  assert.equal(afterOptionalExchange.hand.length, 14);
  assert.deepEqual(afterOptionalExchange.players.map((item) => item.handCount).sort((a, b) => a - b), [13, 13, 13, 14]);
  assert.equal(afterOptionalExchange.exchangeSelectionCount, 1);

  host.close();
  guest.close();
});
