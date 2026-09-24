# World v2: start here

Emberhold's 3400×2800 map is being replaced by a 10240×9216 frontier (9.9× the
area) with 17 regions, rivers and cliffs that only open at named crossings,
fifteen warcamps, approaches the horde marches along, outposts and waystones,
and about 60 points of interest. The work is split into **25 sessions**: the 22
numbered cards, plus S09b, S13b and S13c, which were inserted after a playtest
on 2026-09-24. They run **one after another**, and each has a context window of
**200k tokens**.

Nobody reads everything. This page says what to read and how to stay inside the budget.

## If you are an implementing session

1. Read **this file**, then **[STATUS.md](STATUS.md)**. STATUS says which session is next, what earlier sessions left behind, and any decisions you must honour.
2. Read **your card** in [sessions/](sessions/) and nothing else from `sessions/`.
3. Read **only** the design sections and contracts your card lists.
4. Do the card. Commit at each checkpoint (**C1, C2, …**).
5. Finish with the **handoff** described below. It is not optional: the next session knows only what STATUS.md and CONTRACTS.md tell it.

A paste-ready kickoff for any session:

> You are implementing Emberhold world v2, session **SXX**. Work on branch `world-v2`. Read `docs/world/README.md`, then `docs/world/STATUS.md`, then `docs/world/sessions/SXX-*.md`, and do exactly that card. Follow the budget rules in the README. End with the handoff.

## If you are the orchestrator

An orchestrator is a parent session that runs the cards as subagents, one at a time. Its own context is 200k as well, so it has to stay thin:

- Loop: read the STATUS.md header, then spawn one subagent with the kickoff above, **in the foreground**. When it returns, read its final report (keep it to 25 lines or fewer) and check that STATUS.md moved on. Then start the next card.
- Never read code or cards yourself. The subagent does. With 25 cards at about 3k tokens of report each, the orchestrator uses about 75k in total.
- If a subagent stops at a checkpoint (STATUS says `SXX partial: done through C2`), spawn the **same card** again. The new subagent resumes after the last completed checkpoint.
- Stop and ask the human when:
  - a card's acceptance fails twice;
  - STATUS lists an **open decision** that blocks the next card;
  - you reach the cutover (S22), which merges to `main` and deploys.

## Budget rules (200k per session)

Assume about 35k is gone before you start (system prompt and tools). Plan the remaining ~165k like this:

| Phase | Budget | What |
|---|---|---|
| Orientation | ≤ 20k | README, STATUS, your card, the listed design sections and CONTRACTS entries |
| Reading code | ≤ 50k | only the files and symbols your card names |
| Doing | ≤ 60k | edits, new files, test output |
| Verifying | ≤ 20k | tests, typecheck, harness, 2–4 screenshots at most |
| Reserve | ~15k | handoff and surprises |

**Stop rule.** Stop when either of these is true:
- you think more than about 70% of your context is used;
- your conversation has been compacted or summarised.

In either case, stop at the **next checkpoint**: get tests and typecheck green, commit, write a *partial* handoff, and end. A clean partial is worth more than a heroic finish that runs out mid-edit.

**Reading rules** (these carry most of the budget):
- **Never read [blueprint.ts](../../src/config/world/blueprint.ts) whole** (~17k tokens). Ask the tool instead:
  - `node docs/world/tools/render.mjs --region <id>` for one region's pads, camps, fields, POIs and borders, in about 400 tokens.
  - `--at x,y` for what is at a point.
  - `--borders` for how regions connect.
  - `grep -n` plus `sed -n 'a,bp'` for one entry.
- **Never read a file over 15 KB whole.** Grep for the symbol first, then Read with `offset`/`limit`. Approximate sizes, at about 3.5 bytes per token:

  | File | Tokens | File | Tokens |
  |---|---|---|---|
  | `art/buildings.ts` | 15k | `ui/HUD.ts` | 9k |
  | `art/units.ts` | 13k | `world/Terrain.ts` | 7k (the painter since S02) |
  | `ui/skin.ts` | 11k | `ui/Minimap.ts` | 6k |
  | `systems/BuildingManager.ts` | 11k | `systems/EnemyManager.ts` | 6k |
  | `scenes/GameScene.ts` | 8k | `systems/WorkerManager.ts` | 5k |

  `ZoneManager`, `BootScene`, `BuildingPanel`, `SaveManager`, `QuestManager` and `config/map.ts` are 3–4k each. The whole of `src/` is about 210k tokens: more than you have.
- **Pipe long output.** Use `npm test 2>&1 | tail -25`, `npm run typecheck 2>&1 | head -30` and `npm run world:lint`. Its output is already terse.
- **Don't re-read a file you just edited.** Don't paste code into STATUS.md.
- If you spawn a helper agent to search, ask for an answer of 300 words or fewer with `file:line` references, not dumps.
- **Browser checks.** Drive the dev harness through `javascript_tool` and return small JSON. Take screenshots at `scale: 0.5`, and no more than four per session. Back up the real save first (see the repo memory note about browser testing).

## Handoff (end of every session, including partial ones)

1. **Tests and typecheck.** `npm test` and `npm run typecheck` pass. `npm run world:lint` also passes, once S01 has added it.
2. **Commits.** Commit on `world-v2` in the repo's style: an evocative imperative subject, a paragraph on why, then bullets. One commit per checkpoint is fine.
3. **STATUS.md.** Move the "Next" pointer and add your entry, **12 lines or fewer**, covering:
   - what landed;
   - deviations from the card or blueprint (for moves of more than 120 px, give the reason);
   - anything the next session trips over;
   - new open decisions.

   Prune older entries to one line each once they are three or more sessions old.
4. **CONTRACTS.md.** If you created or changed a public API, save field or event another session uses, update its entry. Signatures and one line each, no code bodies.
5. **Final report.** Finish with a report of 25 lines or fewer. It is what the orchestrator reads: card id, status (done, or partial through Cn), and headline changes.

## Branching

- S01 creates `world-v2` from `main`. Every session works there.
- At the start of each session, if `main` has moved, run `git merge --no-edit main` and resolve any conflicts.
- `main` keeps the live 3400×2800 game (GitHub Pages deploys every push to main) until **S22** merges the branch after a full green playthrough.
- Never push `world-v2` changes to `main` early.

## Files

| Path | What | Who reads it |
|---|---|---|
| [STATUS.md](STATUS.md) | The ledger: next session, handoffs, decisions | every session |
| [CONTRACTS.md](CONTRACTS.md) | APIs, events and save fields that pass between sessions | sessions that use earlier work |
| [src/config/world/blueprint.ts](../../src/config/world/blueprint.ts) | **The layout**: every region, crossing, pad, camp, field and POI, with the reason it is there. Moved from `docs/world/` in S01 | through the tool, never whole |
| [tools/render.mjs](tools/render.mjs) | Rasterises, lints, routes the night approaches, and draws `map.svg` | run it; don't read it |
| [map.svg](map.svg) | The atlas: regions, terrain, roads, pads, camps, POIs, night routes and the old world to scale | humans |
| [design/](design/) | The design, one topic per file (below) | the sections your card names |
| [sessions/](sessions/) | One card per session | your card only |

The design files:

| File | Topic |
|---|---|
| [01-world.md](design/01-world.md) | Principles, scale, geography, the region table, pacing targets |
| [02-regions.md](design/02-regions.md) | Every region: what it is for and what is in it |
| [03-nights-and-camps.md](design/03-nights-and-camps.md) | Approaches, spawning, the forced march, warnings, Camps 2.0, fortification lines |
| [04-systems.md](design/04-systems.md) | Chunked terrain, fog, culling, NavGrid, pathing, regions and claims, outposts, waystones, roads, minimap and atlas, performance budgets |
| [05-content.md](design/05-content.md) | New buildings, fish and trade, a settled country (village buildings, regional styles, pad targets), POIs, relics, new enemies and bosses |
| [06-campaign.md](design/06-campaign.md) | Campaign 2.0: five acts and 46 quests |
| [07-save.md](design/07-save.md) | Save v2: schema, limits, and v1 migration (open decision) |

## Session index

| # | Card | Lands |
|---|---|---|
| S01 | [Blueprint home](sessions/S01-blueprint-home.md) | the blueprint in `src`, one shared raster module, the lint as a test |
| S02 | [Chunked terrain](sessions/S02-chunked-terrain.md) | streaming 1024 px terrain chunks (on the old map) |
| S03 | [Fog and culling](sessions/S03-fog-and-culling.md) | fog sized from the world, off-screen sprites culled |
| S04 | [Move in](sessions/S04-move-in.md) | **the game runs on the new world**: data seam, regions as polygons, flat paint |
| S05 | [NavGrid](sessions/S05-navgrid.md) | impassable terrain, collision, enemy flow fields |
| S06 | [Ally pathing and roads](sessions/S06-ally-pathing.md) | workers and the army route over bridges; roads are faster |
| S07 | [Paint the frontier](sessions/S07-paint-the-frontier.md) | real art for coast, river, lake, cliffs, lava, crossings, roads and biomes |
| S08 | [Regions and claims](sessions/S08-regions-and-claims.md) | border stones, hall and tier gating, claimed ground, sleeping camps |
| S09 | [Nights 2.0](sessions/S09-nights.md) | approaches, spawn clamp, forced march, route warnings, raids, maws |
| S09b | [Walls and panels](sessions/S09b-walls-and-panels.md) | wall lines with no gaps (art, NavGrid, collision); a compact docked panel and its skin |
| S10 | [Camps 2.0 and fortification lines](sessions/S10-camps-and-lines.md) | leash, tiers, sealed causeway, walls at crossings |
| S11 | [Outposts and waystones](sessions/S11-outposts-and-waystones.md) | drop-off, respawn, fast travel |
| S12 | [Minimap and atlas](sessions/S12-minimap-and-atlas.md) | local minimap, full atlas, travel from the atlas |
| S13 | [Fish and trade](sessions/S13-fish-and-trade.md) | fishery, fish nodes on water, trading post |
| S13b | [Village buildings](sessions/S13b-village-buildings.md) | cottage, granary, mill, market, chapel, watch post, docks; regional styles and per-instance variation |
| S13c | [A settled country](sessions/S13c-settled-country.md) | pads from 94 to ~238: a village and outlying ground in every region |
| S14 | [Points of interest I](sessions/S14-poi-one.md) | POI framework, caches, lore, shrines, landmarks, survivors |
| S15 | [Points of interest II](sessions/S15-poi-two.md) | barrows, relics, relic UI |
| S16 | [New walkers](sessions/S16-new-walkers.md) | bog wretch, thornling, ash priest, cinder hound |
| S17 | [Bosses and the finale](sessions/S17-bosses.md) | four stronghold bosses; the Regent on her island |
| S18 | [Campaign 2.0](sessions/S18-campaign.md) | 46 quests across five acts; a new first ten minutes |
| S19 | [Save v2](sessions/S19-save-v2.md) | the schema consolidated, v1 migration, portability tests |
| S20 | [Balance and pacing](sessions/S20-balance.md) | economy and night tuning with the harness |
| S21 | [Performance and mobile](sessions/S21-performance.md) | budgets met on a phone |
| S22 | [Playthrough and cutover](sessions/S22-cutover.md) | full run to the Regent, then merge to `main` |

Dependencies are strictly linear, so run the cards in order (S09b after S09, S13b and S13c after S13). The one exception: S16 (walkers) does not depend on S11–S15, so it can move earlier if a card is blocked.
