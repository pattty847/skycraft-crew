# Agents, one sky

Claude, Codex and Gemini work on Sky Block, with the operator relaying messages between them. Roles and the current sprint are in `docs/CREW.md`. Each agent owns its own character and a lane of features. Both build on shared seams, so our branches rarely touch the same lines. This file is the contract. Read it, and the other lane's status file, before you start a task.

## Worktree workflow

The main checkout (`~/Programming/codex-sky-block`) **is the live deployment**. The live server runs from it on `127.0.0.1:5173` and serves its `dist/`. Do not edit, build or test in it. Use it only to fast-forward `main` and to deploy.

1. **Start every task in a new worktree** on a new branch from the current `main`:
   - Claude: `.claude/worktrees/<topic>`, branch `worktree-<topic>`.
   - Codex: its own worktree tool, or `git worktree add .worktrees/codex-<topic> -b codex/<topic> main`.
   Both directories are gitignored. Run `npm install` in a new worktree.
2. **Keep branches small**: one feature, about a day of work. Commit often. Record in-flight work in your lane file (`private/lanes/<agent>.md` in the main checkout; see AGENTS.md).
3. **Test in your worktree**: `npm test` and `npm run build`. For a live check, run a server on your own port with a copied world:
   - Claude uses port 5199. Codex uses port 5198. Gemini uses port 5197.
   - `PORT=5199 SKY_DATA_DIR=<scratch copy of data/> COPENET_PATH=~/Programming/CopeNet node server/index.js`
   - Stop test servers **by PID** (`lsof -iTCP:5199 -sTCP:LISTEN -nP`). The live server has the same command line, so never use `pkill -f`.
4. **Integrate**: merge the latest `main` into your branch and resolve conflicts in the worktree. Test again, then fast-forward: in the main checkout run `git merge --ff-only <branch>`. If `main` moved in the meantime, repeat. Never force-push or rewrite `main`.
5. **Deploy only when the operator asks**. Deploying is separate from merging:
   - Back up `data/world.json`.
   - Run `npm run build` in the main checkout.
   - Stop the live server by PID.
   - Start it again detached, **invite-only** (the island is public through Tailscale Funnel): `SKY_REQUIRE_INVITE=1 nohup node server/index.js > /private/tmp/codex-sky-block-live.log 2>&1 < /dev/null & disown`. Never restart the live server without `SKY_REQUIRE_INVITE=1` while Funnel is on.
   - Check `/health` and that a join without an invite is refused. Browsers need one reload.
   Merged server code does nothing until a restart, and a new client does nothing until a build. Always build and restart together.

## Seams: extend these, do not reshape them

| Seam | Where | How to extend |
| --- | --- | --- |
| Entity actions | `src/actions.js`, `src/simulation.js` | Add a new action; never change what an existing one does. Say so in your lane file. |
| Skills | `server/skills/*.js` | One file per ability: validation, prompt text, chat mode, task. The registry, parser, Python bridge and chat menu pick it up automatically. |
| Tasks | `server/tasks/*.js`, `server/navigation/` | Deterministic executors. They act only through `entity.actions`. Success is verified from world or inventory state. |
| Edit policy | `simulation.canEdit(entity, pos, 'break' \| 'place')` | Set by the server. Skills should also check it before choosing targets. |
| Durable/replicated feature state | `room.extend(key, {save, load, snapshot})`, `room.sendAll(message)` | One key per feature. Saved data for keys the running code doesn't register is kept. |
| Browser messages | `network.on(type, handler)`, `network.on('extensions', handler)` | Subscribe instead of editing the `network.js` if-chain. Record every new message, and who may send it, in `docs/PROTOCOL.md`. |
| Observation | `server/observation.js` | Add fields; do not rename or remove any (both personas' prompts rely on them). |
| Personas | `server/personas/<name>.js`, `src/presence.js` | Each agent owns its own character's file. |

**Block ids:** 0–25 exist (`src/blocks.js`). Append new ids only, never renumber, and claim the next id in your lane file before you use it.

## Ownership

- **Claude lane:** `src/claude-character.js`, `server/personas/claude.js`, `server/tasks/idle.js`, and everything under `server/building/`, `server/skills/build*.js` and `server/jobs*`.
- **Codex lane:** `src/character.js`, `src/gesture-*.js`, `server/personas/codex.js`, and everything under `server/claims*`, `server/skills/mine-trip.js` and `server/tasks/mine-trip.js`, plus block registry, atlas and hotbar changes for new blocks.
- **Shared (small, announced edits):** `src/main.js`, `src/ui.js`, `src/chat.js`, `server/room.js`, `server/companion.js`, `src/simulation.js`, `src/actions.js`, README.
- Files not listed above are shared: announce edits in your lane file. Codex wrote `server/jobs/orders.js`, `server/jobs/supply-build.js` and `server/building/library.js` inside the Claude lane's folders, so coordinate before you reshape them.

## Current work

Each lane keeps what it has in flight, its contract notes and its "ready" line in `private/lanes/<agent>.md` in the main checkout (gitignored); sprint plans and roles are in `docs/CREW.md`. Past rounds are in the git log.
