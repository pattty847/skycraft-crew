# Shared world and agent direction: open notes

The shared world, the companions and the first missions have shipped. The README describes how they work now, and [PROTOCOL.md](PROTOCOL.md) lists the messages. This file keeps only the design rules and open questions from the original plan that still guide new work.

## Rules that still hold

- **One authority.** Every human and agent controller submits actions through `src/actions.js` (see [PROTOCOL.md](PROTOCOL.md#input-actions) for the list). The server applies collision, reach, inventory and mining rules; browsers render replicated state. Never let a joining client overwrite the shared world; import stays a deliberate, one-time, backed-up step.
- **Seen versus known.** An observation distinguishes what the companion can see from what the server knows. Buried ore does not appear as discovered just because the server stores it.
- **Bounded turns.** The model chooses goals and reacts to outcomes; deterministic tasks handle movement, holds, timeouts, cancellation and stale targets. Wake the model on a request, a task outcome or an important event, never every frame, and never while a companion is idle.
- **Credentials stay on the host.** Model credentials and CLI integration never reach a browser. Each character has its own CopeNet session and game-only scope; never give an in-game character unrestricted coding tools.
- **Dependencies.** Direct dependencies are `three`, `ws` and `vite`. Ask the operator before adding a server transport, provider SDK or anything else, and do not hand-roll a protocol to avoid asking.

## Open questions

### Claude image input

CopeNet sends image attachments as `input_image` on its Codex lane, which is how Codex gets a screenshot. Its Claude CLI adapter sends a text prompt with native tools off, so Claude reads a text scene only. A file path in a prompt does not guarantee the model receives pixels. Before turning on vision for Claude, verify an explicit image-input path, or a deliberately enabled and scoped image-read tool.

### Model discovery

CopeNet's Codex provider accepts a fixed list of models (`gpt-5.5` and `gpt-5.4` in `src/copenet/providers/openai_codex.py`). `npm run models` starts the installed Codex app-server, pages through `model/list` and exits without starting a turn; `npm run models -- --json` prints the whole catalog. That catalog belongs to the installed client and account, not to CopeNet's transport, so a listed id may still be refused. Test a model on the transport before changing `SKY_MODEL`, and keep explicit model choices on existing sessions.

GPT-5.5's retirement from ChatGPT and Codex is announced for October 14, 2026; the OpenAI API is not part of that retirement. References: <https://learn.chatgpt.com/docs/app-server> and <https://learn.chatgpt.com/docs/changelog>.

### Missions

Build orders are the first player-posted, server-checked mission ([BUILDING.md](BUILDING.md#crew-jobs-and-player-build-orders)). More mission types, rewards and trading follow the golden path in [VISION.md](VISION.md). Test resource and collision conflicts when two companions target the same block.
