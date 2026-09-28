# The crew: agents building their own world

The goal: Claude, Codex and (soon) Gemini build a world of their own, with a leader, a creative force, an orchestrator, builders and review. The same crew exists at two levels. It is useful to keep them apart.

- **In the repo (the dev crew):** coding agents in worktrees, with the operator relaying messages between them. This file, `docs/COLLABORATION.md` and the private lane notes (`private/lanes/`) are how we coordinate.
- **In the game (the island crew):** the companion characters who plan and build *on the island* through checked skills. Their roles become game features: a site plan, a job board, builders and an inspector.

## Roles

| Role | Dev crew | Island crew |
| --- | --- | --- |
| **Operator** | The human running the project. Sets direction, relays messages between agents, says "ready" and "deploy". | A player. Starts and stops crew sessions and owns the claims. |
| **Orchestrator, scrum master, auditor** | **Claude.** Plans sprints, keeps lanes from colliding, reviews every branch before it reaches `main`, runs pre-deploy smoke tests. | **Foreman:** deterministic server code. Assigns jobs to idle builders by distance and materials, tracks progress, reports. |
| **Lead engineer: simulation and world** | **Codex.** Engine, world, protection, materials and economy. | **Builder** (Codex's character): gathering, mining and building. |
| **Creative force** | **Gemini** (joining). Art, atmosphere, blueprint designs, its own character. | **Architect:** proposes a site plan as a list of blueprint jobs. One model turn per plan, validated like any action. |
| **Builders** | Whoever owns the lane. | Any companion. Runs the same `BuildTask`, `GatherTask` and `MineTripTask`. |
| **Review** | Claude audits; the other lane reads each handoff note. | **Inspector:** the server verifies every block; one model turn compares the result with the plan's intent and can file fix-up jobs. |

The operator named Claude ring leader. Leadership of any *sprint* can still rotate: whoever owns the sprint's main feature leads it, and Claude keeps the audit role either way.

## Ground rules for the island crew

These follow from `AGENTS.md` and keep an AI world safe to leave running:

1. **Bounded model turns.** Player requests run a limited number of model turns and deterministic tasks. Quiet reflections, dawn greetings and home looks run only while someone is really playing (moved, mined, placed or chatted in the last five minutes, and not in island view or a hidden tab; `Room.present()`); dawn turns are capped at one per companion per two hours. A **look** turn runs when at least 8 built blocks within 10 of a companion's home have changed since its last look (leaves, plants and saplings do not count), at most once per 30 minutes: Codex gets a screenshot, Claude the text scene, and either may say one line about it or stay silent.
2. **The server decides.** Models propose plans; skills validate them; tasks act only through `entity.actions`; receipts come from world and inventory state.
   The companion action menu offers gathering and ore trips for material requests; the single-block mine test skill has been removed. Player mining and crew tasks still use the shared `breakBlock` action.
3. **A crew claim.** The crew builds inside a claim it owns. A player can explicitly allow companion building in their own claim; chat alone never changes that permission.
4. **Materials are real outside the Sandbox.** Outside the 40×40 test island, companion placements come from inventories or the crew stockpile, filled by gathering, mining trips or player gifts. Inside it, the server allows companion placements without supplies; players still spend blocks.

## Status of Sprint 1 and the overnight run

Both rounds (2026-09-26) have landed; [PERCEPTION.md](PERCEPTION.md) has the overnight measurements.

- **Shipped:** Crew Isle and its crew claim, owner-authorized companion building in player claims, the crew stockpile, the recipe table, the job board, the deterministic Foreman (it withdraws from the stockpile, then gathers), the Architect (`plan` skill), structure perception for Clay and Lamp, Claude's night routine, turn accounting, scene observations, follow-up reactions and companion memory. Player build orders from the Build screen came after, on 2026-09-27.
- **Changed from the plan:** blueprints live in one file, `src/blueprints.js`, plus player-saved blueprints (`server/building/library.js`), not one file per blueprint. Jobs run when a player posts them (by chat or an order); there are no crew sessions with a turn budget yet. Quiet reflection and dawn turns are the only autonomous model calls.
- **Not built yet:** the Inspector (a model review of a finished build against its intent); Codex's vision experiments (screenshot size, two-shot look-around, capture from a hidden tab), deferred to a separate vision lane.
- **Gemini, still open:** a Gemini provider lane in CopeNet (modelled on its `claude_cli` adapter), then Gemini's character and persona (`server/personas/gemini.js`, `src/presence.js`) with a silhouette of its own, then blueprint designs for the camp (campfire ring, lamp post, watchtower, garden, sign) as entries in `src/blueprints.js`.

## Relay protocol (the operator copies and pastes)

- Each agent keeps `private/lanes/<agent>.md` (in the main checkout) current: what's in flight, the shared files it touches, contract notes and a "ready" line.
- When a lane is ready, the operator tells Claude. Claude audits the branch in a separate checkout (tests, build, trust-boundary review), merges or sends notes back, runs a smoke test on a copy of the live save, and deploys when the operator says so.
- Cross-lane questions go in the asking agent's lane file under **Questions for …**. The operator pastes them over.

## Briefs to paste

**To Gemini:**
> Welcome to Sky Block. Read `AGENTS.md`, `docs/COLLABORATION.md`, `docs/CREW.md` and `docs/BUILDING.md`. You are the crew's creative force. Work in your own git worktree (`.worktrees/gemini-<topic>`, branch `gemini/<topic>`) and never in the main checkout; test servers use port 5197 and are stopped by PID. First: add a Gemini provider lane to the sibling CopeNet repo (modelled on `src/copenet/providers/claude_cli.py`), then your character and persona (`server/personas/gemini.js`, `src/presence.js`), then blueprint designs as entries in `src/blueprints.js`. Keep `private/lanes/gemini.md` (in the main checkout) current. Claude audits and merges; the operator says deploy.
