# How companions build

This is how Claude (or Codex) turns "build me stairs up to my roof" into blocks in the world. The ideas carry over to any game where an AI proposes actions and the game has to stay in charge.

## The split: the model chooses, the game decides

The model never places a block. It returns one small JSON action:

```json
{"type":"build","blueprint":"stairs-to","structure":"S1"}
{"type":"build","blueprint":"bench","on":{"x":31,"y":22,"z":44},"facing":"east"}
{"type":"build","blueprint":"stairs","near":"requester","params":{"height":4}}
```

Everything after that is ordinary, deterministic game code:

1. **Validate** (`server/skills/build.js`). The blueprint must exist. `on` and `target` must be blocks the model was actually shown. `structure` must be one it was told about. Params are clamped by the blueprint's ranges. Unknown fields are dropped: the action is rebuilt from scratch.
2. **Plan** (`server/building/planner.js`). Turn the blueprint into world cells and refuse the whole build *before anything is placed* if the plan cannot work.
3. **Execute** (`server/building/build-task.js`). Walk, place and confirm one block at a time, only through `entity.actions.placeBlock`, the same action a player's keypress uses.
4. **Report.** The receipt comes from comparing the world with the plan, not from the model.

If a plan is refused, the reason goes back to the model on its next turn ("Not enough materials: I need 45 planks (I have 10)"). It usually picks something smaller or somewhere else.

## Blueprints: shapes in local coordinates

`src/blueprints.js` describes each build relative to an anchor cell, with **x to the builder's right, y up and z forward**. Stairs of height 3:

```
      z=0  z=1  z=2          (side view, facing →)
y=2             [P]
y=1        [P]  [p]          P = step, p = support under the next step
y=0   [P]  [p]
```

`toWorld(anchor, facing, p)` rotates that into one of four facings: `forward` is the facing vector and `right` is forward turned 90°. So one description serves north, east, south and west. A blueprint also lists **clear** cells that must stay empty. For stairs that's three blocks of headroom above each step, enough to jump up to the next.

## Planning: refuse early, never half-build

`planBuild` checks, in order:

- **Space**: every planned cell is air or already holds the right block. The builder never breaks anything.
- **Headroom**: every clear cell is empty.
- **Protection**: `simulation.canEdit(builder, cell, 'place')` for every cell (protected areas plug in here).
- **Materials**: the blocks still missing, counted against the builder's own inventory.
- **Support**: can every cell actually be placed?

### Support order: breadth-first from the ground

The game only lets you place a block that touches (shares a face with) something solid. So the planner asks: starting from what already exists, can we reach every planned cell by attaching one block at a time?

```
ready = planned cells touching the world
while cells remain:
    if nothing is ready: the rest would float → refuse
    place the lowest ready layer; each placed cell may make new cells ready
```

This is a breadth-first search over the plan's adjacency graph, seeded by contact with the world. Placing the lowest layer first means a plan that works on paper also works in order. A floating plan (a path out into the sky from nowhere) is refused with the first cell it can't reach.

### Proving stairs help: simulate before you build

For `stairs-to`, "the stairs fit" isn't enough; they have to make the roof reachable for you. The planner builds an **overlay world**: an object whose `get(x,y,z)` returns the planned block if there is one, and otherwise the real one. The pathfinder only reads `get` and `inside`, so it walks the imagined world with no changes to the real one:

```
reachable now?          → "You can already walk up there; no stairs needed."
for each side and height that fits:
    reachable with this plan?   → build this one
none?                   → "Stairs would fit, but you still couldn't walk up."
```

On your shelter this found that the stepped roof is *already* walkable, so it builds nothing. That's the right answer, and one no prompt could guarantee.

## Seeing buildings: perception matters more than prompting

In the first live test, asked for stairs onto the shelter roof, Claude picked a *bridge plank*. It had been handed 120 block coordinates and no way to tell which planks were the house. The fix was perception, not a better prompt. `server/building/structures.js` groups connected planks (and wood touching them) into **structures**:

```json
{"id":"S1","kind":"building","size":{"x":7,"y":3,"z":6},"roofY":25,"distance":3}
{"id":"S2","kind":"walkway","size":{"x":13,"y":2,"z":5},"roofY":23,"distance":4}
```

Trees are wood and leaves without planks, so they never appear. Now the model says `"structure":"S1"` and the server picks the roof edge, side and number of steps itself. The model supplies **intent** ("the house"); the server supplies **geometry** (which cell, which side, how many steps).

The same lesson shrank the observation. Block lists are now grouped by name as `[x,y,z]`: 14.4 KB → 3.2 KB at the shelter, and a build turn dropped from 56 s to about 18 s. (Turning off Claude's hidden thinking later brought turns to about 4–6 s; see [PERCEPTION.md](PERCEPTION.md).)

## Executing: one block at a time, checked

`BuildTask` repeats:

1. **Pick** the lowest unfinished cell that touches something solid, nearest the builder first.
2. **Can I place it from here?** Eye within reach (6 blocks), a clear ray to the cell's center, not standing inside it, and not standing inside any cell still to be built.
3. If not, **walk** there. The navigation goal is that same test (`isGoal: p => canPlaceFrom(p, cell)`), so the pathfinder searches for somewhere to *stand* rather than a fixed coordinate. The walk settles exactly on its last waypoint, where the line-of-sight check was made.
4. **Place** with `entity.actions.placeBlock`, then **confirm** on the next tick that the world holds exactly that block.
5. If someone is standing in the cell, wait. On the fourth failed try at one cell, give up and report which cell failed.

If anything other than the planned block appears in a planned cell, the build stops. It never mines its way through. Builders can climb their own stairs while building, because placed blocks are ordinary terrain to the pathfinder.

Browsers see a **ghost preview**: every planned cell not yet placed glows faintly in the builder's color (`src/build-preview.js`), replicated through `room.extend('builds', …)`. Open player orders show the same way (white until a companion takes them).

## Crew jobs and player build orders

The model's `plan` skill can still post several builds. A player can also order one from the **Build** screen (`src/build-panel.js`, key B): pick a catalog entry and its params, aim the ghost, rotate it with R, and order. The browser sends `build-order` with the catalog key, params, a whole-block anchor and a facing. The server checks the full plan (protection, support, space), overlap with other open orders, a 32-block distance from the player and an initial reachable standing spot, then posts a fixed-cell job. Build orders are members-only, because they spend crew materials, and each player gets one attempt every 3 seconds, refusals included. Limits: 3 open orders per player and 8 in all. Jobs and orders persist, and interrupted running jobs reopen after a restart; finished orders are pruned to the last 20. The Foreman assigns a free companion without a model call.

The companion obtains missing materials from the crew stockpile first: it walks there, sends `withdraw` actions and verifies each `stockpileReceipt`. It gathers wood, stone, dirt, sand, clay or natural leaves when needed, and uses the `craft` action for planks. `BuildTask` then walks, places through actions and verifies every planned cell in the world. The order stays visible with `placed` and `total` counts until done, failed or cancelled. An order whose cells are all inside the 40×40 Sandbox skips the stockpile and supply phases; simulation checks every companion placement there and keeps its inventory unchanged.

### Walkways that pave

The Build screen's two-click Walkway control and the companion `path-to` skill share `planPath` in `src/path-plan.js`. A successful result is `{ok:true,cells,replace,clear,length,route,width,expanded}`. `route` contains standing positions. `cells` contains every floor cell intended to be planks, including existing planks; the browser ghost draws these same cells. `replace` is the subset currently holding grass, dirt, sand, clay or stone. `clear` holds removable plants and leaves. Wood, lamps, other built blocks and ores stay walkable along the route and stay out of `cells`; they are left untouched. A route with no missing plank cells is already built.

For a walkway, the build task processes `cells` in route order. At a `replace` cell it walks into mining reach, repeatedly sends `breakBlock` until the world is empty there, then walks into placement reach, sends `placeBlock` and confirms the plank in the world. It continues to the next cell only after confirmation. Gaps take the placement step alone. Mined floor drops enter the builder's inventory through normal simulation mining. The supply phase counts one plank for each `cells` entry that is not already a plank; companions placing wholly inside Sandbox still place for free.

The server checks break and place permission for every replacement. A protected natural floor is unavailable to the route planner, so it may route around the claim; if a protected endpoint or constrained route has no permitted path, the order is refused before work begins. Open order overlap includes `cells`, `replace` and `clear`. Before execution, the supply task checks that replacements are still natural and editable. A change in the floor or its permissions during execution stops the task. `path.planned` records how many floor cells are replaced and how many gaps are bridged.

A member can save a claim no larger than 16×12×16 as a blueprint of 1–512 solid cells; the Build screen offers your own claims. Plants and inventory-only items are skipped. Only the blueprint's owner can delete it. Build and plan skills can use saved catalog keys. To draw an exact ghost for any catalog entry, call `previewCells(entry, anchor, facing, params)` from `src/blueprints.js`.

The messages (`build-order`, `build-order-cancel`, `blueprint-save`, `blueprint-delete`) and the `orders` and `blueprints` shapes are in [PROTOCOL.md](PROTOCOL.md).

## Adding a blueprint

1. Add an entry to `BLUEPRINTS`: `label`, `summary` (the model reads it), `params` with ranges, `blocks(params)` and `clear(params)`.
2. Add its name to the list of blueprints that the flat-ground test in `tests/building.test.js` builds.

The catalog in the model's prompt is generated from `BLUEPRINTS`, so there is nothing else to update.
