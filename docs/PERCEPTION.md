# How companions see the world, and what it costs

Findings from the overnight run (2026-09-26) with real model calls on a copy of the live world. The tools are in the repo, so every number here can be reproduced.

| Tool | What it answers |
| --- | --- |
| `npm run turns [data-dir]` | Every real model turn: prompt size by part, provider-reported tokens, latency, outcome. Logged to `agent-events.jsonl` as `type: "turn"`. |
| `node scripts/perception-bench.mjs [world.json] --models=haiku,gpt --formats=… --repeat=N` | Scripted scenes with ground-truth questions, asked of real models in different observation formats. Scores accuracy against size, tokens and time. |
| `node scripts/thinking-bench.mjs [world.json] --runs=N` | The real Auto turn with and without the Claude CLI's hidden thinking. |

## 1. Show a scene, not a dump

Six questions per scene (island, the player's compass direction, planks carried, which structure is the house, its roof height, one visible grass block), two scenes (the shelter on Origin Island and Claude's nook), two runs each:

| Format | Size | Haiku 4.5 | GPT-5.5 | GPT input tokens |
| --- | --- | --- | --- | --- |
| Full observation JSON (before) | 15.5 KB | 92% | 100% | 9,220 |
| Compact block lists | 4.2 KB | 96% | 100% | 4,645 |
| **Scene sentences + only what the mode needs (now)** | **3.5 KB** | **100%** | **100%** | **4,234** |
| Scene sentences only | 1.6 KB | 83% | 83% | 3,303 |

- **Words beat coordinates for relations.** With raw JSON, Haiku named the wrong compass direction for the player; the one sentence "Player 3f77 is 2 blocks south" fixed it. Models are poor at turning coordinate pairs into directions and distances, so the server does it (`describeScene` in `server/observation.js`).
- **Perception beats prompting.** Asked for stairs onto "the house", the model had picked a bridge plank from a list of 120 coordinates. Grouping connected planks into named structures (S1 building 7×3×6, roof at y 25) made the answer trivial for both models.
- **Only carry what a skill needs.** Each skill declares `needs` (block lists, structures, claims). A mode's turn carries only their union: Gather 0.9 KB, Chat 2.4 KB, Auto/Build 2.8 KB, against 14.6 KB before. Scene-only lost exactly the coordinate question, so a chat turn needs no lists at all.

## 2. The Claude CLI was thinking, not starting up

The real Auto turn ("build a bench and an arch near me") on Haiku through CopeNet's Claude CLI lane:

| | Latency | Output tokens | Chose `plan` |
| --- | --- | --- | --- |
| Default | 19–39 s | 1,275–3,857 | 3/3 |
| `MAX_THINKING_TOKENS=0` | **3.9–6.3 s** | **100–104** | 3/3 |

Claude's persona now spawns with `MAX_THINKING_TOKENS=0` (`SKY_CLAUDE_THINKING` overrides it). Short game decisions don't need hidden reasoning. The server does the thinking that matters: pathfinding, planning and verification.

## 3. Fixed overhead lives in the harness

Every Claude CLI call carries about 10,000–17,000 cached tokens that aren't ours: the CLI's own system prompt and CopeNet's context. Replacing the system prompt through CopeNet (`systemPrompt` in the bridge request) only trimmed that to about 10,700 and didn't change latency. GPT turns carry about 1,600–3,300 tokens of fixed overhead. **Recommendation for CopeNet:** a lean "game" profile, no identity or agent context, for callers that supply their own complete prompt.

CopeNet's Claude adapter also drops Anthropic's `cache_creation_input_tokens`, so reported Claude input tokens undercount. For comparisons use prompt characters (about 4 per token) and GPT's counts.

## 4. What makes a companion feel alive, cheaply

- **Follow-up reactions:** after arriving, delivering, gathering or building, one talk-only turn with a fresh look (a screenshot for Codex). Bounded: one per request, and actions in it are ignored.
- **Memory:** up to 8 short notes per companion ("Sam's house is S1 on Origin Island"), written by the model through an optional `remember` field and shown back next time. About 100–900 characters.
- **Idle life** stays deterministic and free: pottering, greetings and heading home.

## 5. Talk like someone in the world

Companions narrated their plumbing ("from my current observation…", "switch me to Build mode", "(37, 23, 37)", "S1"). In the live chat log, 20% of Codex's replies leaked like this. `server/voice.js` defines what counts as a leak: coordinates, observation or screenshot talk, modes, tool words and receipts. `scripts/voice-bench.mjs` replays casual requests through real models:

| Seven casual requests | Leak rate: Haiku | Leak rate: GPT-5.5 |
| --- | --- | --- |
| Before (observation module as on main at the time) | 43% | 43% |
| After | **0%** | **0%** |

The fix was mostly on the input side, because models repeat what they are shown:

- The scene uses names and distances: "Your nook (S1), 5 blocks tall, is 6 blocks north-east", "the plank bridge between Origin Island and Clover Rise". There are no coordinates in the scene, and raw positions are removed from what the model reads. The block lists that skills pick targets from keep their cells, and validation keeps the full observation.
- Structures are named by protected area ("Sam's house"), by world landmark (`LANDMARKS` in `src/world.js`), or with a plain description.
- History reads as conversation: `{who, said}`, with receipt jargon ("Confirmed: … every block matches the plan") stripped.
- A short voice policy on every turn, including follow-up reactions.
- Auto acts only when asked: questions and small talk get a reply with no action. Before this, "what do you think of my house?" made Haiku walk over. "Come here!" still approaches.

Each turn now logs its `leaks`, `npm run turns` shows leaky replies per companion, and `node scripts/voice-report.mjs data` scores a whole chat log. To compare against an older observation module, save that revision's `server/observation.js` as `server/observation-before.js`, run the bench with `--baseline=server/observation-before.js`, and delete the file afterwards.

## Next experiments

1. ~~Trim Auto's policy.~~ Done: 4,334 → 2,651 characters with a compact blueprint line and a short plan prompt (`prompt.auto` in a skill overrides its main mode's text). Decisions unchanged in real turns.
2. **History:** the last 12 chat entries cost about 1.9 KB. Summarize older entries into a line, or keep only this companion's own thread.
3. **Vision (Codex lane):** screenshot size and quality against usefulness. The benchmark can take an image-based format once capture works headless or from a test browser.
4. **Model choice per turn:** Haiku with zero thinking for chat and actions, a larger model only for the Architect's plans.
