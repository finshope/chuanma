import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the finished Sichuan Mahjong table", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>蜀牌局 · 四川麻将<\/title>/);
  assert.match(html, /换三张/);
  assert.match(html, /血战到底/);
  assert.match(html, /创建好友房/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/);
});

test("ships the complete public-domain suited tile set", async () => {
  const names = ["Back", ...["Man", "Pin", "Sou"].flatMap((suit) => Array.from({ length: 9 }, (_, index) => `${suit}${index + 1}`))];
  await Promise.all(names.map((name) => access(new URL(`../public/tiles/${name}.png`, import.meta.url))));
  const license = await readFile(new URL("../public/tiles/LICENSE.md", import.meta.url), "utf8");
  assert.match(license, /public domain/i);
});

test("keeps multiplayer, 3D tiles, continuous wall, and fan scoring wired", async () => {
  const [client, server, styles, tableStyles, packageJson] = await Promise.all([
    readFile(new URL("../app/game-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../realtime/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/game-table-v2.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(client, /type: "exchange"/);
  assert.match(client, /换 0–3 张/);
  assert.match(client, /selected\.length <= 1/);
  assert.match(server, /Optional exchange counts/);
  assert.match(client, /status: .*"dealing"/);
  assert.match(client, /type: "void"/);
  assert.match(client, /type: "discard"/);
  assert.match(server, /WebSocketServer/);
  assert.match(server, /isWinningHand/);
  assert.match(server, /resolveResponse/);
  assert.match(server, /evaluateFan/);
  assert.match(server, /room\.base \* fanInfo\.multiplier/);
  assert.doesNotMatch(server, /FAN_CAP|Math\.min\([^\n]*rawFan/);
  assert.match(client, /SettlementBreakdown/);
  assert.match(client, /底分.*2/);
  assert.match(client, /function TileWall/);
  assert.match(client, /wallBreakSeat/);
  assert.match(client, /const liveIndex =/);
  assert.match(client, /OpeningSequence/);
  assert.match(client, /self\?\.hasDrawnTile/);
  assert.match(client, /win-showcase/);
  assert.match(client, /player\.winningTile/);
  assert.match(client, /state\.status !== "finished" && lastSettlement/);
  assert.match(server, /player\.hasDrawnTile = true/);
  assert.match(client, /remainingSlots/);
  assert.match(client, /wall-stack.*is-single/);
  assert.match(client, /river-tile/);
  assert.match(client, /pending-discard-cue/);
  assert.match(client, /pendingDiscarderSeat/);
  assert.match(server, /pendingDiscarderSeat: room\.pendingAction\?\.discarder/);
  assert.match(client, /gridColumn: 6 - offset/);
  assert.match(client, /gridColumn: 3 - row/);
  assert.match(client, /Math\.min\(count, 14\)/);
  assert.match(styles, /\.tile-3d/);
  assert.match(styles, /\.tile-3d::before/);
  assert.match(styles, /\.tile-back-face/);
  assert.match(styles, /tile-back-emerald-v3\.png/);
  assert.match(tableStyles, /\.wall-stack\.is-single \.tile-back \{ display: none; \}/);
  assert.match(tableStyles, /\.wall-stack\.is-live::after/);
  assert.match(tableStyles, /--tile-width: 44px;[\s\S]+--tile-height: 58px;/);
  assert.match(tableStyles, /\.river-tile\.is-pending/);
  assert.match(tableStyles, /\.melds-left \.tile-face \{ transform: rotate\(-90deg\); \}/);
  assert.match(tableStyles, /\.melds-right \.tile-face \{ transform: rotate\(90deg\); \}/);
  assert.match(tableStyles, /\.melds-left[\s\S]+left: 230px;/);
  assert.match(tableStyles, /\.melds-right[\s\S]+right: 230px;/);
  assert.match(tableStyles, /\.win-showcase-right \{ top: 72px; right: 0; \}/);
  assert.match(tableStyles, /\.result-layer[\s\S]+backdrop-filter: none;/);
  assert.match(tableStyles, /\.settlement-heading b \{ font-size: 42px; \}/);
  assert.match(styles, /\.river-bottom[^}]+translateX\(-50%\);/s);
  assert.doesNotMatch(styles, /\.river-bottom[^}]+rotate\(180deg\)/s);
  assert.match(packageJson, /realtime\/server\.mjs/);
  assert.match(packageJson, /--hostname 127\.0\.0\.1/);
  assert.doesNotMatch(packageJson, /0\.0\.0\.0/);
});
