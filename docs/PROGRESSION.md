# Progression

## Phase 1: living trees and foraging (built on `codex/living-trees`)

Trees now renew themselves. A leaf with no wood reachable through four nearby leaf steps is scheduled to decay after 5–30 seconds; the server removes at most one due leaf per second. Player-placed leaves are durable. Roughly one decayed leaf in twelve plants a sapling on clear dirt or grass below it; if there is no valid ground, nothing drops. Saplings can also be collected and placed. They grow into the existing small-tree silhouette after 3–8 minutes if the trunk and canopy space is open, otherwise they retry every 30 seconds. Growth and decay use ordinary server block changes.

The old decorative meadow spots are now collectible red and brown mushrooms and yellow and white flowers. They are crossed canvas sprites that can be mined instantly, carried, and replanted on dirt or grass. Forage slowly returns on untouched natural grass, with a cap of 30 plants per island. All five new block IDs are appended after Lamp, and the block registry identifies plants separately from solid blocks. Plants do not stop movement or provide support, but raycasts can target them.

On the first server start with an older save, terrain version 3 copies `world.json` to `before-forage-<time>.json` and fills only empty cells above still-present natural grass at the former decoration spots. It preserves occupied cells and does not run again after the terrain version is saved. Ecology timers, placed-leaf provenance, and disturbed grass cells persist in the `ecology` room extension. Older saves cannot distinguish a leaf replanted in precisely the same original canopy cell; those cells retain their original natural classification.

Companions use their existing break and place actions for these blocks. Gather wood still recognizes natural trunks by the same grounded-trunk-and-leaf rule, including grown trees; there is no new model skill.

## Phase 2: materials ladder (built on `codex/progression-2`)

This is the materials foundation for the golden path in [Vision](VISION.md): goals and verified missions can ask for tiers of equipment and resources, and later rewards and trades can use the same stable item IDs. Old block IDs and inventory stacks remain unchanged. New inventory-only items are Stick (17), Wooden pickaxe (18), Stone pickaxe (19), Iron pickaxe (20), and Iron ingot (21). New placeable blocks are Crafting table (22), Furnace (23), Torch (24), and Lantern (25). Torch is a passable sprite; lantern is a solid light block. The six nearest lamp, torch, or lantern sources allocate lights, with torches smaller and lanterns larger than lamps.

| Station | Recipes |
| --- | --- |
| Hand | 1 wood → 4 planks; 2 dirt + 1 sand → 4 clay; 1 coal ore + 1 plank → 1 lamp; 2 planks → 4 sticks; 4 planks → 1 crafting table; 1 coal ore + 1 stick → 4 torches |
| Crafting table within 4 blocks | 3 planks + 2 sticks → wooden pickaxe; 3 stone + 2 sticks → stone pickaxe; 3 iron ingots + 2 sticks → iron pickaxe; 8 stone → furnace; 1 iron ingot + 1 torch → lantern |
| Furnace within 4 blocks | 1 iron ore + 1 coal ore → 1 iron ingot |

`src/recipes.js` exports the recipe list and `canCraft(world, entity, key)`; the Bag · Craft screen (`src/bag-panel.js`, key I) uses both to list all twelve recipes by station and show what is missing. `Simulation.craft` alone changes inventory and checks ingredients and station reach. Browser `craft-material` messages send a `recipe` key; older numeric `blockId` recipes still work.

The selected hotbar item is the player's mining tool. Wooden, stone, and iron pickaxes mine stone and ores at ×2, ×3, and ×4.5 speed. Hands retain their existing speed and can still mine stone and coal ore. Iron ore now requires stone or iron pickaxe. Companions automatically use their best carried pickaxe, including one transferred through `give`; an iron mining trip without one reports the missing tier. Mining, crafting, placement, and refusal outcomes use the existing trace path. Tools do not lose durability yet.

## Phase 3 notes

Add tool durability, furnace smelting time and fuel handling, and more tiers when goals and mission rewards need them. Keep timing and consumption server-owned, with task receipts verifying completion.
