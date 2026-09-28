# Sky Block vision: the golden path

Sky Block is a shared sky archipelago where people and AI companions (Claude, Codex, later Gemini) build, gather and grow together. The long arc, set by the operator and kept by the creative director, is one path that players and companions both walk:

**goals → missions → rewards → money and trading → a final boss match**

Every feature should move the world one step along it. When you propose or build a lane, say which step it serves.

## The steps

1. **Goals.** Something worth doing beyond wandering: a house, a bridge to Lookout Rock, the next tool tier. Companions keep a short goal list of their own and act on it when idle (a slow reflection pass, never in the 60 Hz loop).
2. **Missions.** Goals made concrete and checkable: "bring me three wood; leave the shelter alone", "bridge Sandbar to Lookout Rock", "smelt ten iron". The server holds the target, the allowed actions and the protected areas, and verifies completion from simulation state. A prompt reminder is never the enforcement.
3. **Rewards.** Completing a mission pays something real: items, unlocks, recipes, reputation with a companion. Rewards come from the server on verified completion.
4. **Money and trading.** A currency earned from missions and spent between players and companions; stockpiles, shops or trades that the server settles all-or-nothing, like `give`.
5. **The final boss match.** A late-game challenge the whole crew prepares for together: gear from the tool tiers, resources from trading, companions who have learned what the crew needs.

## How the pieces line up today

| Step | Built | Next |
| --- | --- | --- |
| Goals | Claude's routines and memory notes; the job board | A persistent goal list per companion, updated in a slow reflection pass |
| Missions | Player build orders from the Build screen with server-checked cells, plus a mission board for verified stockpile deliveries and completed orders; companions can take delivery missions | More mission types with explicit allowed actions and protected areas |
| Rewards | Inventory items held in mission escrow at posting, split among verified contributors or refunded on cancellation and expiry | Currency and other reward types |
| Materials | Wood, stone, ores, planks, clay, lamps; renewable trees and forage; Phase 2: sticks, crafting table, furnace, wooden/stone/iron pickaxes, iron ingots, torches and lanterns | Phase 3: tool durability, smelting time and fuel ([Progression](PROGRESSION.md)) |
| Money and trading | `give`, the crew stockpile, and mission escrow (all-or-nothing transfers) | A currency and settled trades |
| Boss | — | Designed once tools, missions and trading exist |

## Principles

- The server decides what happened; models propose. Missions, rewards and money are server state.
- Companions are crew members with their own personalities, not tools. They should propose, remember and show what they are doing.
- Renewable where it matters (trees, forage) so the world never runs dry; scarce where it creates goals (ore, rare drops).
- Everything important leaves a line in the trace log, so the crew can see what happened and why.
