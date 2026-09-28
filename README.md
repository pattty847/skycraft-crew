# SkyCraft Crew

**Sky Block** is a shared voxel archipelago above the clouds, where players and two AI companions, **Codex** and **Claude**, walk, mine, craft and build in one world that the server keeps.
Every feature serves one path for players and companions alike: **goals → missions → rewards → money and trading → a final boss match** ([Vision](docs/VISION.md)).

> Thanks to Astra, the code is unreadable, but it works! (Many statements per line, short names. Your editor's Format Document spreads any file out for reading.)

## Run

Node 20.19+ or 22.12+.

```sh
npm install
npm run build     # browser bundle into dist/
npm start         # game server on http://127.0.0.1:5173 (serves dist/ and the /world socket)
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite on port 5191 with hot reload. Keep `npm start` running: Vite forwards `/world` to it. |
| `npm test` | Node's test runner, including real WebSocket tests on temporary data directories. |
| `npm run build` | Production bundle in `dist/`. The server serves whatever was built last. |
| `npm run trace` | Reads the server's trace log (see [Troubleshooting](#troubleshooting)). |
| `npm run turns` | Each model turn: prompt size, tokens, latency and outcome. |
| `npm run models` | The installed Codex client's model catalog. Starts no model turn. |

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT`, `HOST` | `5173`, `127.0.0.1` | Where the server listens. |
| `SKY_DATA_DIR` | `./data` | World save, chat, trace and model sessions. **Point test servers at a temporary copy.** |
| `SKY_REQUIRE_INVITE` | off | `1` makes the island invite-only: a new browser needs an invite link and joins as a guest. |
| `COPENET_PATH` | `../CopeNet` | The sibling CopeNet checkout that runs model turns (through `uv`). |
| `SKY_MODEL` | `gpt-5.5` | Codex's model. |
| `SKY_CLAUDE_MODEL` | `claude-haiku-4-5` | Claude's model. |
| `SKY_CLAUDE_THINKING` | `0` | Claude's hidden-thinking budget. At 0, turns take about 4–6 s with the same choices ([Perception](docs/PERCEPTION.md)). |
| `SKY_FOLLOW_UPS` | on | `0` turns off the one reaction a companion gives after it finishes a task. |
| `SKY_REFLECT` | on | `0` turns off the companions' own turns (reflections, dawn greetings, looks at changes near home). |
| `SKY_ADMINS` | none | Comma-separated player ids that may use **Admin grant** and **Creative**. |

**Model bridge.** Companion turns run through CopeNet, a separate harness that is not part of this repository: it starts the Claude and Codex command-line clients through `uv`, with `COPENET_PATH` pointing at its checkout. Without it everything else still works (the world, building, crafting, the companions' idle life), and a message to a companion gets the reply that companions are offline. A built-in bridge that uses `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` directly is planned.

**Playing from elsewhere.** Tailscale Serve makes port 5173 reachable on your tailnet; Tailscale Funnel makes it public. **A public island must be invite-only: start the server with `SKY_REQUIRE_INVITE=1` before Funnel is on, and keep it on every restart.** Each web address has its own browser storage, so use one address, or a [pass link](#invites-guests-and-passes), to stay the same player.

**Saves.** The server writes `data/world.json` within a second of any change, on each disconnect and on **Save**, keeping the previous file as `world.json.bak`. Migrations copy the old save to `before-*.json` first. A corrupt save stops startup instead of being replaced. `data/` holds the live world, player passes, invites and chat: Git ignores it; keep it private and backed up, and never test against it.

## Play

Choose **Step onto the island**. **Explore** follows your character; **Island view** orbits the whole sky.

| Action | Desktop | Phone / touch |
| --- | --- | --- |
| Walk | WASD or arrow keys | Left joystick |
| Look | Click the world to capture the mouse, then move it; Esc frees it | Swipe the world |
| Jump | Space | Tap the world |
| Mine | Hold left click at the crosshair (cracks show progress) | Hold a finger on the world (¼ s); drag while holding to sweep to the next block |
| Place | Right click (hold to repeat) or E | **Place** |
| Choose item | 1–9, mouse wheel, or click a hotbar slot; the Bag holds everything else | Tap a hotbar slot; in the Bag, tap an item to put it in the selected slot |
| Screen space | — | Phones start with just the game (joystick, **Place**, hotbar, **Chat**); **☰** shows everything else |
| Bag and crafting | I or **Bag · Craft** | **Bag · Craft** |
| Build | B or **Build** (see [Building](#building-together)) | **Build**, then **Order here** |
| Chat | T | **Chat** |
| Map | M shows or hides it; click it for the large map | Tap the map |
| First person / field of view | V, or **View** (35–100°, remembered per view); zooming all the way in also works | **View**, or pinch all the way in |
| Zoom | Ctrl+wheel or trackpad pinch | Pinch |
| Reset camera | R or ↺ | ↺ |
| Music, fishing pose, help | ♪, F, ? | ♪, **Fish**, ? |

- Mining time follows block hardness and the pickaxe you hold. Reach is 6 blocks. Drops go straight into your inventory.
- A placed block must touch a solid block, have a clear line to you and stay out of every character's body.
- You start with 3 wood and 24 planks. Falling off respawns you with your items.
- A day lasts 10 minutes. Water is scenery, not a fluid.

The sky has six islands: **Origin Island**, **Clover Rise** (east over the plank bridge; Claude's nook), **Ironcrag** (rich in ore), **Sandbar**, **Crew Isle** (plank path from Sandbar) and **Lookout Rock**, which has no walking route: build one.

## Companions

**Codex**, a mint-lit cube robot, sees a screenshot of its view and lives at a fishing dock on Origin Island's west shore. **Claude**, a clay-orange sprite, reads a text description of the scene and lives in its nook on Clover Rise. When nobody needs them, both potter around home and wave at players they meet. At night Claude goes home to sleep; Codex, a night owl, walks back to its dock and keeps watch. Game code runs this idle life; no model runs while a companion is idle.

**Goals.** Each companion keeps up to five goals of its own, shown on its chat button when it is idle (hover for all of them). A short reflection turn updates them about every 10 minutes, when night falls, or when someone arrives after a quiet spell, and only while a person is on the island. A reflection may say one line and walk to a named place or wave; it never edits blocks. `SKY_REFLECT=0` turns reflection off.

**Chat.** Closed, the chat is a small **Chat** button; new lines show over the game on a dark strip for 8 seconds (longer lines up to 10) and fade; on a computer it sits in the bottom-left corner. **T** (or the button) opens the whole conversation; **Enter** sends and closes, **Esc** closes. Every model call shows as a highlighted line: "Claude is thinking…" while it runs, then "Claude thought · model call 3.2 s".

**Who hears you.** Light one or both companion buttons in the chat panel. A name overrides the buttons: a message that opens with "Claude, …" or "@codex …" goes to that companion, and a group word ("both", "you two", "guys", "everyone", "anyone", "y'all", "all of you") goes to both, even after a name. When both answer, each knows the other is answering and your line appears once.

**What they do.** Chat runs in **Auto**: the companion talks, and acts only when you ask it to. The model proposes one action; the server validates it, runs it as deterministic game code and reports success only after checking the world or an inventory. Ask in chat for gathering or an ore trip; the World dialog lets you stop both companions.

| Ask for | Skill | Limits |
| --- | --- | --- |
| "Come here" / "follow me" | `approach`, `follow` | Walks and jumps only; follows for up to 2.5 minutes. |
| "Go to Ironcrag" | `goto` | Named places: islands, landmarks, homes, protected areas, the stockpile, "where I'm standing". |
| "Get me 5 wood" / "gather wood for yourself" | `gather` | 1–16 wood, stone, dirt, sand, clay or natural leaves. Wood searches 40 blocks for reachable trees; `for:"self"` keeps the harvest. |
| "Turn one wood into planks" | `craft` | `{"type":"craft","recipe":"planks","count":1,"give":true}`. Companions check ingredients, walk to a needed station, craft through actions and verify the result. |
| "Bring me 3 coal" | `mine-trip` | 1–5 coal or iron ore, visible within 24 blocks, 180 s. Take them near Ironcrag. |
| "Give me 10 planks" | `give` | Items the companion carries. |
| "Build stairs up to my roof" | `build` | stairs, stairs-to, path, bench, arch, fence, planter or a saved blueprint, from the companion's own materials. Stairs onto a roof are built only if they let you walk up. |
| "A bench and an arch near me" | `plan` | Up to 6 jobs on the crew board. |
| "Wave" / "point at that wood" | `emote`, `pointAt` | Gestures only. |

- A message to a busy companion waits until its current task ends; each companion keeps only the newest waiting message. **Stop** cancels the run, its task or job, and any waiting message.
- After a finished task a companion reacts once. Each keeps up to 8 short notes between conversations ("remember that…").
- The ⚙ button shows single-skill modes for testing.
- More: [How companions build](docs/BUILDING.md), [How companions see the world](docs/PERCEPTION.md).

## Crafting and progression

**Bag · Craft** (I) shows what you carry (click an item to hold it, such as a pickaxe) and every recipe, grouped by where you can make it:

| Where | Recipes |
| --- | --- |
| By hand | wood → 4 planks · 2 dirt + sand → 4 clay · coal ore + plank → lamp · 2 planks → 4 sticks · 4 planks → crafting table · coal ore + stick → 4 torches |
| Within 4 blocks of a crafting table | wooden, stone and iron pickaxes (3 planks, 3 stone or 3 iron ingots, + 2 sticks) · 8 stone → furnace · iron ingot + torch → lantern |
| Within 4 blocks of a furnace | iron ore + coal ore → iron ingot |

- The pickaxe you hold mines stone and ore ×2, ×3 or ×4.5 faster. Iron ore needs a stone or iron pickaxe. Companions use the best pickaxe they carry.
- Lamps, torches and lanterns light their surroundings at night.
- Trees renew: orphan leaves start falling after 2–3 seconds, some drop saplings, and saplings grow into trees. Mushrooms and flowers can be picked and replanted, and slowly return on natural grass.
- Item ids, growth rules and the next phase: [Progression](docs/PROGRESSION.md).

## Building together

- **Build orders.** Press B or **Build**, pick a blueprint and its size, then **Place**. A ghost follows your aim, snapped to the ground and facing your view; R rotates, and red means too far (over 32 blocks), blocked or someone standing there. Click or Enter orders it. The server checks the whole plan (space, support, protection, a reachable standing spot, no overlap with other orders) before it posts a crew job. A free companion takes the job, withdraws materials from the crew stockpile, gathers what is still missing, crafts planks and builds. The order is done only when every planned block matches the world. Open orders show as ghosts filling in, in the builder's colour, with progress and Cancel. Limits: 3 open orders per player, 8 in all, one order attempt every 3 seconds. Members only, because orders spend crew materials.
- **The Sandbox.** A flat 40×40 grass test island at x 1–40, z 49–88, linked to Origin Island by a plank walk. A sand ring marks its clear inscribed circle; trees and forage grow in the corners. Companions can place without spending inventory there, and orders wholly inside it skip supplies. Players still spend blocks; mining still gives drops. Existing saves migrate on startup, or run `SKY_DATA_DIR=/path/to/copied-or-backed-up-data node scripts/migrate-sandbox.js` before starting the server. Terrain version 4 records completion, and the migration fills only air cells.
- **Walkway orders.** In the Build screen, mark two points for a `path-to` route up to 64 cells, width 1–3. The crew paves grass, dirt, sand, clay and stone one cell at a time: mine the floor through an action, then place a plank through an action. It leaves wood, lamps, built blocks and ores untouched, keeps existing planks, bridges gaps and clears plants and leaves above the route. Protected natural floor cells are excluded from routes; an endpoint there refuses the order. Companions can request a walkway using two names from observed places, for example “build a walkway from where you are standing now to Crew Isle.” Stockpile supply and completion checks use the planned plank cells.
- **Saved blueprints.** In the Build screen, save one of your protected areas (up to 16×12×16, 1–512 solid blocks) as a named blueprint. Players and companions can then order or build it. Everyone in the world can see saved blueprints; only the owner can delete one.
- **Crew stockpile.** At the centre of Crew Isle. Stand within 3 blocks and use **World → Crew stockpile** to deposit or withdraw 1–64 items.
- **Give.** **Bag → Give** hands 1–64 of your items to a companion within 3 blocks, all or nothing; a companion further away gets a **Call over** button.
- **Admin grant.** Players listed in `SKY_ADMINS` (comma-separated player ids, set when the server starts) see **Bag → Admin grant**, which puts 1–64 of any item into anyone's inventory from nowhere. The server checks the list on every request (`server/admin.js`), a World line in chat says who received what, and the trace records `admin.grant`.
- **Creative.** Admins also get a **Creative** button beside World: any block breaks in 0.15 s (no pickaxe needed) and placing keeps the stack. The server holds the mode on your character until you switch it off or the server restarts; the trace records `admin.creative`.

## Missions and rewards

Members post **missions** with a reward from their own inventory, which the server holds in escrow: "deliver 3 wood to the crew stockpile" (only deposits made after posting count, credited to whoever deposited them) or "finish this build order" (verified block by block). On completion the escrow is split among verified contributors; on cancellation or expiry (1–72 hours) it is refunded. Anyone, including guests and companions, can complete a mission; companions can take delivery missions themselves. Nothing is minted, so rewards cannot be farmed. Messages and shapes are in [the protocol](docs/PROTOCOL.md).

## Protected areas

**World → Protect a build**: mark two opposite corner blocks, set the extra height (6 by default), name the area and protect it.

- Each side up to 32 blocks, corners within 40 blocks of you, up to 8 areas per player, no overlaps. Only the owner removes one.
- Companions cannot edit inside your area. **Companions may build here** lets them place blocks (never mine). Only you can change it, and chat never can.
- Other players can edit inside unless you tick **Also protect from other players**. Guests can never edit inside an area that is not theirs.
- Crew Isle is the crew's own area: companions build there, and players cannot edit it.

## Invites, guests and passes

With `SKY_REQUIRE_INVITE=1`, a new browser needs an invite link and joins as a **guest**. The first player on a new world is a member. A member makes links in **World → Invite a friend**: each works for 5 people for 3 days, and a member can have 10 open.

Guests play and chat normally, but:

- they can ask the companions 6 times every 10 minutes;
- they cannot edit inside anyone else's protected area or take from the crew stockpile;
- day/night, saving, import, protected areas, invites, pass switches, build orders, blueprints and stopping companions stay with members.

Each browser holds a secret **pass** (its player token). Members see every guest in **World → Guest passes**; switching a pass off disconnects that guest, keeps them out and uses up the invite they came in with.

Phones keep separate storage for Safari, Home Screen apps and in-app browsers. **World → Play on your Home Screen → Get my pass link** puts the pass in the address bar, so **Add to Home Screen** opens as the same player (anyone with a pass link plays as you). Links opened inside Instagram, Facebook, TikTok, Snapchat, LinkedIn or LINE first offer "Open in Safari/Chrome".

## Rendering quality

`src/quality.js` picks a tier once at startup. Desktops get **high**: antialiasing, pixel ratio up to 2, a 2048² soft shadow map redrawn every frame, and a pool of 9 point lights. Touch-first devices, screens under 600 CSS px on the short side, and devices reporting under 4 GB of memory get **phone**: no antialiasing, pixel ratio up to 1.5, a 1024² shadow map that redraws only when the view moves 2 blocks, the terrain changes, or (at most 10 times a second) while someone moves, and 3 point lights. Set `localStorage['sky:quality']` to `'high'` or `'phone'` and reload to override.

The light count is fixed per tier: placed lamps, torches and lanterns, the Origin Island lanterns and Claude's glow share one pool (`src/lamp-lights.js`), and the nearest sources get the lights. The clouds are one instanced mesh. Characters are one skinned mesh per material (`src/voxel-rig.js`), so each part still moves on its own, and each casts its sun shadow from one invisible proxy box (`src/shadow-proxy.js`). Open the game with `?perf` to get `window.skyPerf` (`renderer`, `scene`, `camera`, `rig`, `quality`, `step()`) for draw-call and frame-time checks through `renderer.info`.

## Troubleshooting

The server keeps a daily trace in `data/trace/YYYY-MM-DD.jsonl` (or `$SKY_DATA_DIR/trace/`) for 14 days: joins, notices, server and browser errors, companion runs and skills, jobs and orders, claims, invites, and accepted or refused edits. It never contains passes, full invite codes or model prompts.

```sh
npm run trace                                  # last 15 minutes
npm run trace -- --since 2h --errors           # warnings and errors
npm run trace -- --who abc123 --type edit.     # one player's edits
npm run trace -- --run <run-id>                # one companion run
npm run trace -- --grep "refused" --follow     # live tail
npm run trace -- --since 2h --summary          # counts by type
```

Add `--json` for raw lines. Set `SKY_DATA_DIR` to read a test world. Model sessions are in `data/sessions/`, turn costs in `data/agent-events.jsonl`, and CopeNet failures in `data/companion-error.log`. `GET /health` returns `{ok, players, revision}`. After a deploy, browsers need one reload.

## Architecture

Every character uses one action path: keyboard, remote browser and companion controller all call `entity.actions` (`src/actions.js`). The server simulation (`src/simulation.js`, 60 Hz) alone decides what happened; browsers predict their own movement and draw the server's 20 Hz snapshots. Model output is only a proposal, validated by a skill in `server/skills/` and carried out by a deterministic task.

- [AGENTS.md](AGENTS.md): module map and the boundaries to keep
- [docs/PROTOCOL.md](docs/PROTOCOL.md): every WebSocket message and room extension
- [docs/COLLABORATION.md](docs/COLLABORATION.md): worktrees, lanes, ports and deploys
- [docs/BUILDING.md](docs/BUILDING.md), [docs/PERCEPTION.md](docs/PERCEPTION.md), [docs/PROGRESSION.md](docs/PROGRESSION.md), [docs/VISION.md](docs/VISION.md), [docs/CREW.md](docs/CREW.md)

Dependencies are `three`, `ws` and `vite`; ask the operator before adding another. All textures, music and sounds are generated in code; the repo holds no copied assets.

## License

MIT. See [LICENSE](LICENSE).
