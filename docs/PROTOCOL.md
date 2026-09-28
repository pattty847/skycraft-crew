# Sky Block WebSocket protocol

Every message between a browser and the server, as of `c1d6e8c`. When you add or change a message, update this file in the same commit.

Words used below:

- **member**: a player who is not a guest. Every player in a world without `SKY_REQUIRE_INVITE=1` is a member, and so is the first player of a new world.
- **guest**: a player who joined with an invite link while `SKY_REQUIRE_INVITE=1`.
- **unjoined**: a socket that has not sent a successful `join`.

## Transport

- **HTTP.** `server/index.js` serves `dist/` (a path outside `dist/` gets 403, a missing file 404) and `GET /health` → `{ok, players, revision}`. Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Content-Security-Policy: frame-ancestors 'none'`.
- **Upgrade.** The only socket endpoint is `/world`. The server destroys the socket when the path is not exactly `/world` or the `Origin` host differs from `Host`. The Vite dev server passes this with `rewriteWsOrigin` (`vite.config.js`).
- **Frames.** JSON text, `{type, ...fields}`. `maxPayload` is 1,500,000 bytes.
- **Socket cap.** With more than 64 open sockets, a new socket is closed with `1013 Server busy`.
- **Before join.** An unjoined socket may send only a text frame of at most 4096 bytes that parses to `{type:'join'}`. Anything else closes it with `1008 Join first`, with no trace line and no reply. With no join after 5 s, it is closed with `1008 Join required`.
- **Message budget.** A joined socket may send 80 messages per second (every type counts). Past that, the server writes one `handle.flood` trace line and closes it with `1008 Too many messages`. `Room.receive` also keeps its older counter: more than 100 room messages in one 50 ms broadcast window get the notice `Too many messages`.
- **Errors.** An exception in a handler goes back to that socket as a `notice` with the error text, and the socket stays open. The trace records `handle.error` at most once per 5 s for the same text on the same socket (level `error` for TypeError, ReferenceError and RangeError, `warn` otherwise).
- **Access check.** `access.check(id, type)` runs before every message except `client-error`. For a guest it throws `Only island members can do that.` when the type is in `MEMBERS_ONLY` (`server/access.js`): `day`, `save`, `import`, `claim`, `invite-create`, `guest-pass`, `build-order`, `build-order-cancel`, `blueprint-save`, `blueprint-delete`, `agent-stop`.

### Close codes

| Code | Reason | When | Browser (`src/network.js`) |
| --- | --- | --- | --- |
| 1008 | `Join first` | An unjoined socket sent something other than a small `join` | Reconnects after 1.5 s |
| 1008 | `Join required` | No join within 5 s | Reconnects after 1.5 s |
| 1008 | `Too many messages` | More than 80 messages in a second | Reconnects after 1.5 s |
| 1013 | `Server busy` | More than 64 open sockets | Reconnects after 1.5 s |
| 1013 | `Reconnect for a fresh snapshot` | The socket was not open, or `bufferedAmount ≥ 2e6`, at a broadcast | Reconnects after 1.5 s |
| 4001 | `Opened in another tab` | The same pass joined on another socket | Stops, and says the player opened in another tab |
| 4003 | refusal text (≤120 chars) | Join refused (invite-only and no valid invite, invite used up or expired, pass switched off), or a member switched this guest's pass off | Stops, and shows the reason |

## Browser → server

### `join` (unjoined)

| Field | Meaning |
| --- | --- |
| `token?: string` | The browser's pass. A pass the server knows joins as that player unless it is switched off. An unknown or missing pass gets a new random one. |
| `invite?: string \| null` | Needed only when invite-only is on, the pass is unknown and the world already has players. The invite must have uses left and must not be expired. A successful join uses it once. |
| `compress?: boolean` | `true` sends the welcome's blocks as `deflate-raw`. |

Handled in `server/index.js` with `access.admit` (`server/access.js`) and `room.connect` (`server/room.js`). On success the server sends `welcome`, then `access`, then `guests` (to the new socket if it is a member; to every member if it is a guest). The browser sends `join` on open, with `invite` from `?invite=` and `token` from `localStorage['sky:player-token']` or a `#key=` pass link.

### Handled in `server/index.js`

| Type | Fields | Rules | Who | Sent by |
| --- | --- | --- | --- | --- |
| `client-error` | `message`, `stack` | Traced as `client.error` at most once per 10 s per socket. No reply. Fields are not type-checked; the trace cuts strings to 512 chars. | member, guest | `src/network.js` (window `error` and `unhandledrejection`, at most once per 10 s, 512 chars each) |
| `chat-send` | `text`, `mode`, `agent?`, `agents?[]` | `validateChat` (`server/chat.js`): `text` 1–1000 chars after trim; `mode` one of `auto`, `talk`, `gather`, `build`, `mine-trip` or another registered skill mode; `agent` `codex` or `claude` (default `codex`); `agents` filtered to known keys. The **server** picks the addressees (`server/addressing.js`). A guest gets 6 companion requests per 10 minutes. Each addressee runs the request, or queues it if busy (one queued message per companion; a newer one replaces it). The player's line is posted once. | member, guest (limited) | `src/chat.js` (Send, Come here, Follow me) |
| `agent-stop` | `agent?` | Cancels the companion's model run, task, board job and queued message. No `agent` stops every companion. | member | `src/chat.js` (Stop, one per lit companion), `src/shared-controls.js` (Stop both) |
| `invite-create` | none | At most 10 open invites per member. Each invite has 5 uses and lasts 72 h. Replies `invite` to the sender. | member | `src/invite-panel.js` |
| `guest-pass` | `id` (guest entity id), `on: boolean` | The target must be a guest. `on !== true` switches the pass off, closes every socket of that guest with `4003`, and uses up the invite that guest joined with. Every member then gets a new `guests` list. `id` is not type-checked. | member | `src/invite-panel.js` |
| `presence` | `away: boolean` | Sets whether this browser is really playing (`away` in island view, a hidden tab or the title screen; resent every 15 s). With the last five minutes of walking, jumping, mining, placing or any other message, it decides who is **here** (`Room.present()`); companions reflect, greet at dawn and look at home changes only while someone is here. No reply. | yes | `src/main.js` |
| `admin-grant` | `targetId` (optional; yourself by default), `blockId` 1–25, `count` 1–64 | The sender must be in `SKY_ADMINS` and not a guest; the target must be present. Adds the items from nowhere, posts a World chat line, traces `admin.grant` (refusals `admin.refused`). Replies with a `notice`. | admin (`SKY_ADMINS`) | `src/give-panel.js` |
| `creative` | `on: boolean` | The sender must be in `SKY_ADMINS` and not a guest. Sets creative mode on the sender's own character (blocks break in 0.15 s with any tool; placing keeps the stack), traces `admin.creative`, replies `creative {on}` and a `notice`. Off again on reconnect or restart. | admin (`SKY_ADMINS`) | `src/creative-toggle.js` |
| `capture` | `request`, `revision`, `image` | Matched to the companion waiting for a screenshot **from this socket** with the same `request`. Unmatched messages are dropped. `revision` must equal the capture request's, and `image` must be a `data:image/jpeg;base64,…` string of at most 1e6 chars, or the turn fails. The server waits 8 s. | member, guest (only the socket that was asked) | `src/main.js` (640×480 JPEG at quality 0.8; nothing while the tab is hidden) |

### Handled in `Room.receive` (`server/room.js`)

| Type | Fields | Rules | Who | Sent by |
| --- | --- | --- | --- | --- |
| `input` | `frames: [{sequence, actions[]}]`, `selected?: int` | 1–6 frames per message, at most 30 queued per socket. Each `sequence` is a safe integer above the last accepted one. At most 12 actions per frame, each rebuilt through `createActions` (see [Input actions](#input-actions)). An unknown action rejects the whole message. Held input expires 300 ms after the last `input`. `selected` (1–25) sets the held item, which is also the mining tool. One frame is applied per tick; a backlog over 4 frames is folded into one tick. | member, guest | `src/network.js` (3 frames per message at 60 Hz, so 20 messages/s) |
| `claim` | `operation` and more, see [Claim operations](#claim-operations) | | member | `src/claim-controls.js` |
| `blueprint-save` | `claimId`, `name` | `name` 1–40 chars after trim. The claim must exist and be at most 16×12×16. The result has 1–512 **solid** cells (plants and items are skipped). At most 64 saved blueprints per world and 16 per owner, and no repeated name per owner (case ignored). Key `player:<12 hex>`. Broadcasts `blueprints` and saves. | member (any claim; the Build screen offers your own) | `src/build-panel.js` |
| `blueprint-delete` | `key` | Only the blueprint's owner. Built-in blueprints cannot be deleted. Broadcasts `blueprints`. | member who owns it | `src/build-panel.js` |
| `build-order` | `blueprint` (≤80 chars), `params` (object), `anchor` (integer `{x,y,z}`), `facing` (`north`, `east`, `south`, `west`) | One attempt per player every 3 s, refusals included (`Wait a moment before placing another build order.`). Anchor within 32 blocks of the sender. At most 8 open orders, 3 per owner. `planBuild` checks params, facing, bounds, space, headroom, protection (as the nearest companion) and support, but not inventory. No overlap with the cells or clear cells of another open order. A path search (up to 3000 nodes per companion, run in the handler) must find a standing spot for one unfilled cell. Posts a crew job `{kind:'build', spec:{fixedPlan}}`, broadcasts `orders` and `jobs`, saves. A refusal is traced as `order.refused`. | member | `src/build-panel.js` (Order here, click or Enter while placing) |
| `build-order` walkway form | `blueprint:'path-to'`, `from` and `to` (integer `{x,y,z}` marked block cells), `params:{width:1\|2\|3}`; no `anchor` or `facing` | Sender must be within 32 blocks of either endpoint. The pure `src/path-plan.js` route uses at most 64 cells and 4096 expanded states. `cells` includes planned planks on natural ground, gaps and existing planks; unusual solid floors remain in the route but are left alone. `replace` lists natural floor cells to mine before placing planks, while `clear` lists removable headroom plants/leaves. Protected natural floors cannot be replaced. Existing order limits, overlap, reachability, stockpile supply, snapshots, progress and world-verified completion apply. `orders` entries include `from`, `to`, `cells`, `replace` and `clear`. `path.planned` traces carry `replaced` and `bridged` counts; `path.refused` and `path.built` record outcomes. | member | two-click Path control |
| `build-order-cancel` | `id` (order id = job id) | The order must be open. The Foreman cancels the running task; the job becomes `cancelled`. | member (the Build screen shows Cancel on your own orders) | `src/build-panel.js` |
| `craft` | none | Legacy: crafts `planks` (1 wood → 4 planks). No reply. | member, guest | **nothing** (`network.craftPlanks()` exists, no caller) |
| `craft-material` | `recipe?`, `blockId?` | `Simulation.craft(recipe ?? blockId)`. Any key of `RECIPES` in `src/recipes.js`; a station within 4 blocks when the recipe needs one. Replies a `notice` with the result. | member, guest | `src/bag-panel.js` (sends `recipe`) |
| `day` | none | Sets the phase to 0.76 (night) or 0.24 (day). | member | `src/main.js` (header button) |
| `save` | none | Saves now. Replies `notice` `Shared world saved on the Mac.` | member | `src/main.js` (Save button) |
| `import` | `save` (v1 device save) | Refused once the world was imported or edited. Validated by `loadGame` (`src/storage.js`). Writes `before-import-<ms>.json`, replaces the world, and sends **every** socket a reduced `welcome`. | member | `src/shared-controls.js` |

Any other type throws `Unknown message`.

### Missions (`server/missions/board.js`, via `Room.receive`)

| Type | Fields | Who | Notes |
| --- | --- | --- | --- |
| `mission-post` | `title` (1–80), `objective` `{type:'deliver',blockId,count}` or `{type:'build',orderId}`, `reward` `{blockId,count 1–64}`, `hours` 1–72 | members | Exact field sets; the reward leaves the poster's inventory into escrow. 3 open per poster, 12 total. |
| `mission-accept` | `id` | anyone | Marks interest; does not reserve completion. |
| `mission-cancel` | `id` | the poster | Refunds the escrow. |

### Claim operations

| `operation` | Fields | Rules |
| --- | --- | --- |
| `create` | `name` (1–40), `protectPlayers: boolean`, `min`, `max` (integer `{x,y,z}` inside the world) | Each side 1–32 blocks. 8 claims per owner, 128 per world, no overlap. Both corners within 40 blocks of the sender. The server sets `id`, `ownerId` and `allowCompanions: false`. |
| `remove` | `id` | Owner only. |
| `authorize` | `id`, `allowCompanions: boolean` | Owner only; the `crew` claim cannot change. Lets companions **place** blocks there, never mine. |

Each success saves and broadcasts `claims`.

### Input actions

`createActions` (`src/actions.js`) checks the arguments. The browser whitelist is in `Room.receive`. Companions call the same API directly.

| Action | Fields | Checks | From a browser | Sent by browser code |
| --- | --- | --- | --- | --- |
| `move` | `dir {x,y,z}` finite | vector | yes | `src/input.js` |
| `jump` | none | none | yes | `src/input.js` |
| `lookAt` | `target {x,y,z}` finite | vector | yes | `src/input.js` |
| `breakBlock` | `pos` integers | Simulation: reach 6, a visible face, `canEdit(…,'break')`, the pickaxe tier for iron ore | yes | `src/input.js` |
| `placeBlock` | `pos` integers, `blockId` 1–25 | Simulation: not an item, in inventory, empty cell, reach and a clear ray, `canEdit(…,'place')`, no body overlap (plants excepted), plant ground, support | yes | `src/input.js` |
| `say` | `text` | cut to 180 chars; a speech bubble for 5 s, **not** a chat entry | yes | `src/ui.js` (fishing line) |
| `emote` | `name`: `wave`, `nod` or `null` | enum | yes | **none** (companions only) |
| `pointAt` | `pos` integers | Simulation: a visible block within 12 | yes | **none** (companions only) |
| `give` | `targetId`, `blockId` 1–25, `count` 1–64 | From a browser `targetId` must be a companion. All or nothing, within 3 blocks across and 1.5 up or down. Replies `transfer-result`. | yes | `src/give-panel.js` |
| `deposit`, `withdraw` | `blockId` 1–25, `count` 1–64 | Within 3 blocks across and 1.5 up or down of (56.5, 20, 96.5); stacks stay ≤ 65535. **Guests cannot withdraw.** Replies `stockpile-result`. | yes | `src/stockpile-controls.js` |
| `craft` | `recipe` (a `RECIPES` key) | recipe key | **no** (browsers send `craft-material`) | companions only (`server/jobs/supply-build.js`) |

## Server → browser

| Type | Fields | To | Sent from | Browser handler |
| --- | --- | --- | --- | --- |
| `welcome` | `token`, `you`, `chat[]` (≤100), `agentStatus` (**always null**), `agents {key: agent-status}`, `modes [{key,label}]`, `extensions {key: snapshot}`, and the snapshot: `seed`, `size {x:128,y:48,z:128}`, `encoding` (`raw` or `deflate-raw`), `blocks` (base64 of a `Uint8Array` indexed `x + 128*(z + 128*y)`), `revision`, `phase` (0–1), `time` (simulation seconds), `entities[]`, `canImport` | the joining socket; after `import`, every socket gets one with only `you`, `token` and the snapshot | `Room.connect`, `Room.receive` (import) | `src/network.js` (checks `size`, decodes blocks, dispatches `extensions`) |
| `state` | `revision`, `changes [[index, blockId], …]` since the last broadcast, `entities[]`, `phase`, `time`, `canImport`, `ack` (last input sequence simulated for this socket) | every socket, every 50 ms | `Room.broadcast` | `src/network.js` (applies changes, reconciles prediction) |
| `notice` | `text` | one socket | `Room.notice` (handler errors, companion request errors, craft results, save) | `src/shared-controls.js`, `src/bag-panel.js`, `src/build-panel.js` |
| `chat` | `entry {id, kind: user\|assistant\|action\|system, name, text (≤1600), entityId\|null, time}` | all | `WorldChat.add` (`server/chat.js`); also appended to `data/chat.jsonl` | built-in (`network.onChat`) |
| `agent-status` | `agent`, `name`, `text`, `busy`, `thinking` (boolean), `why` (`reply`, `follow-up`, `reflect`, `dawn`, `look` while a model call runs; otherwise the last reason or null) | all | `Companion.announce` (`server/companion.js`); every model call sends `thinking:true` at start and `thinking:false` at end, including silent reflections | built-in (`onAgentStatus`, `onChatStatus`) |
| `capture` | `request`, `agent`, `entityId`, `revision`, `position`, `direction` | the requesting socket | `Companion.observe` (vision personas: Codex) | built-in (`onCapture` in `src/main.js`) |
| `access` | `role` (`member` or `guest`), `admin` (boolean), `requireInvite` | the joining socket | `server/index.js` | `src/invite-panel.js`, `src/give-panel.js` |
| `creative` | `on` | the admin who sent `creative` | `server/index.js` | `src/creative-toggle.js` |
| `guests` | `guests [{id, number, joined, by, on, online}]` | members only | `server/index.js`, on a guest's join or leave and after `guest-pass` | `src/invite-panel.js` |
| `invite` | `code`, `maxUses`, `expires` (ms) | the member who made it | `server/index.js` | `src/invite-panel.js` |
| `transfer-result` | `ok`, `targetId`, `blockId`, `count` | the giver | `simulation.onTransfer` (`server/room.js`) | `src/give-panel.js` |
| `stockpile-result` | `action`, `blockId`, `count`, `ok` | the player who acted | `server/stockpile.js` | `src/stockpile-controls.js` |
| `stockpile` | `stockpile {position, items[26]}` | all, after each successful transfer | `server/stockpile.js` | `src/stockpile-controls.js` |
| `claims` | `claims [claim]` | all | `server/claims.js` | `src/claim-controls.js`, `src/build-panel.js` |
| `jobs` | `jobs [job view]` | all | `server/jobs/board.js` | `src/jobs-panel.js` |
| `builds` | `builds [{id, builder, label, cells [{x,y,z,id}]}]` | all | `server/building/board.js` | `src/build-preview.js` |
| `orders` | `orders [order view]` | all; on post, cancel, every job change and every block change in an open order's cells | `server/jobs/orders.js` | `src/build-panel.js`, `src/build-preview.js` |
| `blueprints` | `blueprints [catalog entry]` | all | `server/building/library.js` | `src/build-panel.js` |

### Shared shapes

- **entity on the wire** (`compactEntity` in `server/room.js`, decoded by `src/network.js`): `{id, p:[x,y,z], v:[x,y,z], d:[x,y,z], g:0|1, s:selected, b?:breaking, t?:speech, u?:speechUntil, ge?:gesture, i?:inventory}`. Only the receiving player's own entity carries `i`; details in [PERFORMANCE-PROTOCOL.md](PERFORMANCE-PROTOCOL.md). Saves keep the full `entityState` shape.
  - `gesture` is `{kind: wave|nod|point, startedAt, endsAt, pos?, blockId?}` or `null`, in simulation time (`src/gestures.js`). It is never saved.
  - Player ids are UUIDs. Companion ids are `codex-companion` and `claude-companion`.
- **claim**: `{id, ownerId, name, min, max, protectPlayers, allowCompanions}`. The crew claim is `{id:'crew-isle', ownerId:'crew'}`.
- **job view**: `{id (8 chars), kind: build|gather, label, status: open|running|waiting|done|failed|cancelled, assignee: codex|claude|null, result, postedBy, waitingFor}`. The last 20 jobs.
- **order view**: `{id, jobId, blueprint, label, params, anchor, facing, cells [{x,y,z,id}], ownerId, assignee, status, placed, total}`. Open, running and waiting orders only.
- **catalog entry**: `{key, label, summary, params, kind: built-in|player}`.
  - A built-in entry's `params` maps each name to `{min, max, default}`.
  - A player entry also has `ownerId` and `blocks [{x,y,z,id}]` (`z` ≤ 0, so the layout faces north). Every browser sees these.
  - To draw a ghost, call `previewCells(entry, anchor, facing, params)` from `src/blueprints.js`.

## Room extensions

A feature registers durable or replicated state with `room.extend(key, {save, load, snapshot})`. A key with `snapshot` appears in `welcome.extensions[key]`; in the browser, `network.on('extensions', fn)` receives the whole object after each welcome. `save` writes to `world.json` under `extensions[key]`. Saved data for a key that no running code registers is kept.

| Key | Registered in | Saved as | Snapshot | Live update |
| --- | --- | --- | --- | --- |
| `missions` | `server/missions/board.js` (Room) | missions incl. escrow and payouts | active + 12 recent: `{id,title,postedBy,objective,reward,status,progress{count,contributors},acceptedBy,expires,postedAt,escrow,payouts}` | `{type:'missions',missions}` |
| `goals` | `server/goals.js` (Companion) | `{companionId:[goal]}` (≤5, ≤80 chars) | same | `{type:'goals',goals}` |
| `dawn-codex`, `dawn-claude` | `server/companion.js` | `{lastDawn,lastGm}` (epoch ms); preserves the two-hour greeting cadence across restarts | none | none |
| `orders` (progress) | `server/jobs/orders.js` | — | — | `{type:'order-progress',id,placed}` between full `orders` lists |
| `terrain` | `server/terrain.js` (Room) | `{frontier: 1..4}`; v4 fills only empty Sandbox cells once | `{frontier}` | none |
| `ecology` | `server/ecology.js` (Room) | `{clock, step, sequence, placedLeaves[], leaves[[i,t]], saplings[[i,t]], disturbed[]}` | none | plant changes arrive in `state.changes` |
| `claims` | `server/claims.js` (Room) | `claim[]` | `claim[]` | `claims` |
| `stockpile` | `server/stockpile.js` (Room) | `items[26]` | `{position:{x:56.5,y:20,z:96.5}, items[26]}` | `stockpile` |
| `blueprints` | `server/building/library.js` (Room) | player blueprints `[{key,label,summary,ownerId,blocks}]` | the full catalog | `blueprints` |
| `orders` | `server/jobs/orders.js` (Room) | open orders and the last 20 finished ones: `{id, jobId, blueprint, label, params, anchor, facing, cells, clear, ownerId, status}` | open order views | `orders` |
| `memory` | `server/memory.js` (first Companion) | `{[companionId]: string[≤8, each ≤120]}` | none | none |
| `jobs` | `server/jobs/board.js` (Foreman) | the last 40 jobs with `spec`; a `running` job loads as `open` | job views (last 20) | `jobs` |
| `access` | `server/access.js` | `{invites[], guests[], guestInfo{}, off[]}` | `{requireInvite}` | `access` (on join only) |
| `builds` | `server/building/board.js`, on the first companion build after a start | not saved | `[{id, builder, label, cells}]` | `builds` |

## Browser dispatch (`src/network.js`)

- `network.on(type, handler)` subscribes a feature module. A late subscriber gets the latest message of that type at once. `'extensions'` gets the latest welcome's extension object.
- `welcome` and `state` never reach `network.on` handlers.
- `chat`, `capture`, `agent-status` and `notice` have built-in handling. **A `network.on` subscriber to one of these types replaces the built-in handling for that type.** `notice` is subscribed by three modules, and `shared-controls.js` sets `network.notice` itself. For the other three, use the hooks `network.onChat`, `onAgentStatus` and `onCapture`.
- `network.send(type, payload)` does nothing before the first welcome or while disconnected.

## Known gaps

1. **Accepted, never sent.** The legacy `craft` message (`network.craftPlanks()` has no caller), and the `emote` and `pointAt` input actions (whitelisted for browsers; no player control sends them).
2. **An import blanks the feature panels.** The reduced `welcome` after `import` has no `extensions`, `chat`, `agents` or `modes`. The browser dispatches an empty extension object, which clears claims, stockpile, jobs, orders and ghosts until each one's next update.
3. **`welcome.agentStatus` is always null.** Nothing sets `room.agentStatus`; use `welcome.agents`.
4. **Every browser sees everything.** Each `state` (20 per second) carries every entity's full inventory, and the blueprint catalog carries every saved blueprint's owner and blocks.
5. **Unchecked fields.** `client-error` fields and `guest-pass.id` are not type-checked. Saved `orders` and `blueprints` are not validated on load beyond being arrays.
6. **Build orders search in the handler.** A `build-order` runs a synchronous path search of up to 3000 nodes per companion, outside the 1.5 ms per-tick navigation budget. The 3 s per-player cooldown and members-only access bound it.
7. **Invite links stay in the address bar.** The browser keeps `?invite=` after joining and copies it into pass links. Switching a guest off uses up the invite they joined with, so the link no longer admits anyone new.
