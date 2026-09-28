# Sky Block contributor guide

This file is for Claude, Codex, and other coding agents working in this repository. Sky Block is a shared, walkable voxel archipelago with human players and two AI companions, Codex and Claude. The goal is to grow it into a world where several agents can perceive, talk, navigate, and complete missions without giving a model direct control of game state.

## Current shape

- Plain JavaScript ES modules, Three.js, Vite, and a Node `ws` server. `npm start` serves the shared game; `npm run dev` is the Vite development view. `npm test` uses Node's test runner; `npm run build` checks the browser bundle.
- `src/world.js` owns the typed-array voxel grid and terrain generation; `src/blocks.js` is the block registry. `src/atlas.js`, `src/mesher.js`, and `src/chunks.js` turn those blocks into original canvas textures and face-culled chunk meshes.
- `src/actions.js` is the common controller contract: `move`, `jump`, `lookAt`, `breakBlock`, `placeBlock`, `say`, `emote` (wave/nod; null cancels), `pointAt`, `give`, `craft`, `deposit` and `withdraw`. `src/entity.js` holds entity state and emits intents. Human input, remote players, and AI controllers use the same action path. Entities and input handlers do not receive a World reference.
- `src/simulation.js` applies intents and owns physics, reach, mining, placement, inventory, crafting, and respawn. `server/room.js` owns the authoritative multiplayer room, client validation, ticks, and persistence. Browsers render snapshots and predict local movement; they do not decide whether a world edit succeeded.
- `server/companion.js` runs one bounded controller per persona (`server/personas/`). Each companion ability is a file in `server/skills/` (validation, prompt text, chat mode, task) and executes as a deterministic task in `server/tasks/` or `server/navigation/` (budgeted incremental pathfinding, using the same collision rules as movement). `scripts/companion.py` calls the sibling CopeNet harness for model conversation and image input. CopeNet supplies the provider lane; Sky Block owns observations, action policy, skills, and outcome checks.
- `server/observation.js` builds bounded, line-of-sight observations; `server/gesture-task.js` verifies gesture execution. `src/gestures.js` owns temporary gesture state; pose/effect modules render it. Gesture timestamps use simulation time, replicate in snapshots, and are excluded from saves. Keep cosmetic state separate from durable world/inventory state.
- Server features are room extensions (`room.extend(key, {save, load, snapshot})`): protected areas (`server/claims.js`), access and invites (`server/access.js`), the crew stockpile (`server/stockpile.js`), jobs and the Foreman (`server/jobs/`), build orders and player blueprints (`server/jobs/orders.js`, `server/building/`), trees and forage (`server/ecology.js`), companion memory (`server/memory.js`) and goals (`server/goals.js`). Recipes and tools are shared with the browser (`src/recipes.js`, `src/tools.js`, `src/blueprints.js`).
- `server/trace.js` writes the troubleshooting trace (`npm run trace`); `docs/PROTOCOL.md` lists every WebSocket message.
- `src/main.js` assembles the scene. Camera, controls, UI, chat, and atmosphere are separate browser modules. `README.md` has run instructions and product context, but verify status claims against current code and tests; some milestone prose predates later work.

## Two agents

Claude and Codex work in parallel lanes, each in its own worktree, and never in the main checkout (it is the live deployment). Read `docs/COLLABORATION.md` for the workflow, file ownership and the seams to extend, and the lane notes for what the other agent has in flight.

**Private notes.** Lane notes, audits, history and deployment scripts live in `private/` at the root of the main checkout. Git ignores it, so it never reaches a public copy, and worktrees do not have their own: read and write it through the main checkout's path (`private/lanes/<agent>.md`). Keep personal details, hostnames and credentials there or in `data/`, never in tracked files.

## Boundaries to preserve

1. **The server decides what happened.** Treat WebSocket frames and model output as untrusted proposals. Validate identity, mode, coordinates, reach, collision, inventory, and block edits on the server. Report completion only after observing the result in simulation.
2. **One action path for every entity.** Keep movement, looking, mining, placing, speech, and gestures behind `src/actions.js`. A navigation or mission skill may choose intents, but it must not teleport an entity or mutate the world or inventory directly.
3. **Keep model reasoning out of the 60 Hz loop.** Give the model a bounded observation and let deterministic game code handle pathfinding, repeated inputs, timing, retries, and verification. Distinguish what an agent can see from information the server knows. Do not let chat text or model claims grant permissions.
4. **Extend by concern, not by speculative framework.** The companion controller already coordinates several concerns; extract focused observation, task, or skill modules as those features become real rather than growing one controller indefinitely. Keep the model bridge separate from game rules so Claude and Codex can share those rules.
5. **Make future missions enforceable.** For requests such as “bring me three wood; leave the shelter alone,” represent target quantity, allowed actions, and protected areas as server-checked task state. Navigation finds a reachable position; a gathering skill executes through actions; inventory changes and delivery verify success. A prompt reminder alone is not protection. Add these pieces when implementing the mission, not as unused scaffolding now.

## Working safely in this repo

- `data/` is a real, gitignored shared world. It contains terrain edits, player inventories, reconnect credentials, chat, and companion records. Do not overwrite, reset, or use it for tests. Set `SKY_DATA_DIR` to a temporary directory for isolated server or agent tests. Back up live state before any intentional migration.
- Keep existing ports and Tailscale serving arrangements intact unless the task explicitly calls for deployment changes. Avoid restarting the live server merely to run a check.
- For behavior changes, add a focused test at the owning boundary and run `npm test` plus `npm run build` before handoff. A docs-only edit needs a diff/format check, not a full game run. If a check cannot run, say why.
- Keep changes and commits focused. Update the relevant README or `docs/` section when behavior or architecture changes, and remove stale claims instead of layering a new account on top.
- Discuss a new runtime or build dependency with the operator before adding it; the current game depends on `three`, `ws`, and `vite`.
- **Keep the trace log current.** `server/trace.js` writes `data/trace/*.jsonl`, searched with `npm run trace`. When you add an action, skill, mission, job, economy change or refusal path, add a `room.trace(type, {level, who, msg, ...})` line for it (dotted `type`, `warn` for refusals, `error` only for real faults, no tokens or full invite codes, nothing per frame). When the trace shows noise or a gap, fix it in the lane that owns the code.
- **Aim at the golden path.** `docs/VISION.md` sets the long arc (goals → missions → rewards → money and trading → a final boss match). Say which step a lane serves.
