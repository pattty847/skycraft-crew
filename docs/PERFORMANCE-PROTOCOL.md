# Server performance protocol

This lane supports the missions and trading foundation at higher player counts.

`welcome.entities` and the 20 Hz `state.entities` use compact objects. Each entity has `id`, `p` (position `[x,y,z]`), `v` (velocity), `d` (direction), `g` (grounded as 0 or 1), and `s` (selected block id). Optional fields are `b` (breaking), `t` (speech), `u` (speech expiry), and `ge` (gesture). Only the receiving player's entity has `i` (the full inventory array). Positions, velocities, and directions are rounded to two decimals. The browser decodes these into Entity fields before prediction and rendering.

`orders` still carries the full active order list on post, cancel, assignment, or job status change. A matching world cell edit sends `{type:'order-progress',id,placed}`; the browser updates that row's count. Order cells are indexed by coordinate for edit lookup.

Durable changes call `room.markDirty()`. A one-second timer coalesces writes; `room.flushSave()` forces a pending write, and `room.save()` forces a write even when clean (the Save button and shutdown). Writes fsync a temporary file, rename the previous save to `.bak`, then rename the temporary file into place. Startup restores `.bak` if the main file is missing after an interrupted rename. A clean SIGINT or SIGTERM writes current players, companions, extension state, phase, and world edits before exit.

Navigation shares a 1.5 ms search deadline across companions each 60 Hz server step. Build-order reachability checks have a 2 ms deadline per request; if that check runs out of time, the server refuses the order and records `order.reachability-pending`. Removed-trunk leaf scans process at most 64 nearby positions per tick.
