# The loop rework: start here

> Opened 2026-09-28 after a playtest. Seven cards (R1–R7), run one after another
> on branch `rework`, each by a fresh session with a **200k context**. Nobody
> reads everything; this page says what to read and how to stay inside the budget.

## What the playtest said

> "Getting gold is very procedurally slow. The troops just following you is not
> good. Enemies come from all over the map, you miss enemies and their drops, and
> the buildings scattered outside the base get destroyed quickly; they don't make
> sense. There is something there to work with, but it feels all over the place."

## Why it happens (read from the code, 2026-09-28)

1. **Coins have no engine.** Every build, crew, soldier and claim is priced in
   coins, but the only coins that come from time are one trading post on
   Saltmere's quay and a market trickle that sells surplus above 300. Crews make
   wood, food, stone, metal and crystal; nobody makes coins. So coins scale with
   killing, and killing scales with walking.
2. **Loot waits for the hero.** Kill coins, xp and cargo drop on the ground and
   only come to the hero inside a 92 px pickup radius. Towers and soldiers kill
   where the hero is not, walkers that flee at dawn drop loot where nobody is,
   and cargo rots after 60 s. Most of a night's loot is never seen.
3. **Walkers detour to everything.** Once a wave walker sets foot on claimed
   ground it re-targets every 0.35 s to the nearest structure within 700 px
   (`EnemyManager.acquire`). Claimed regions are dotted with 400 hp farms and
   260 hp cottages, so every front chews through the countryside on its way in,
   and two or three fronts do it in two or three places at once.
4. **A raze unbuilds the economy.** At 0 hp a building loses a level, and at
   level 0 it becomes rubble and its crew is dismissed (`onBuildingDestroyed`).
   An undefended farm three regions out is simply lost, and rebuilding it is a
   walk and a bill.
5. **The army has one idea.** It follows the hero, or it holds the hall. It
   engages inside 300 px of that anchor and nowhere else, so on a two-front night
   half the hold is undefended whatever the player does.

## The design

One sentence: **by day you grow a country that pays you; by night the horde
comes for the hold, and the hold (towers, walls, the army at its posts and the
hero) is where the fight is.**

### A · The treasury (R1)

- **A tithe.** Coins come from time now: the hall levies a tithe from everyone
  who works or lives in the settlement, banked straight into stores every
  second. `tithe/s = hall[level] + perWorker × working crew + perHome × homes`,
  where homes are cottage and longhouse population. Numbers live in a new
  `TITHE` block in `config/balance.ts`. A sacked building (D) pays nothing.
- **Show it.** The HUD's coin figure carries its income per second, and the
  hall floats a quiet `+N` every ~10 s when on screen.
- **Markets** sell above a lower floor (150) so the surplus actually turns over.
- The trading post stays the big coin building, on the quay.

### B · Loot is never lost (R2)

- **Coins and xp always reach the hero.** After their bounce they fly to the
  hero from anywhere on screen; a kill further than ~1400 px from the hero, or
  while the hero is down, banks its coins and credits its xp directly (xp at
  50%, so the hero still wants to be in the fight).
- **The dawn sweep.** When the night ends, every cargo pickup (wood, food,
  stone, metal, crystal) lying on claimed ground goes into stores, with one
  popup line. Walkers that flee at dawn put their loot straight into the
  sweep instead of onto the grass.
- Cargo on claimed ground does not rot during the night.
- **A night log.** The wave manager keeps `nightLog` (kills, coins earned,
  swept goods, holdings sacked) from dusk to dawn and emits `night:summary` at
  dawn, for the dawn card (F).

### C · The march holds its course (R3)

- **Fronts converge on the hold.** A wave walker on claimed ground *advances*:
  it keeps following the hall's flow field and fights only what gets in its
  way: the hero or a soldier within ~200 px or that hit it, a wall or gate the
  field routes it through (the existing latch), and a structure within ~110 px
  of it. Only once it is **in the hold** (the `hold` region, or within
  `HOLD.assaultRadius` of the hall) does it assault as today.
- **Raids sack the countryside.** Raid walkers (approaches with `raid: true`)
  keep today's behaviour: they detour to structures, and they prefer holdings
  (D). A raid is the thing that burns farms, and burning its camp is how you
  stop it. That makes the threat to the countryside readable instead of random.
- **Fronts arrive one after another.** On a night with two or more fronts,
  each front's spawns are offset by `FRONT_STAGGER` seconds (~10 s) in order,
  and the fight window stretches by the stagger, so the hero and the army can
  meet one front and then the next.
- **A post on every front.** Each of tonight's routes gets a `post`: the route
  point where it enters the hold (a little outside it). The army (E) stands
  there; the UI can mark it.

### D · Sacked, not razed (R4)

- **Holdings** are every built structure that is not a wall, gate, tower
  (`category === 'defense'`) or the hall. At 0 hp a holding is **sacked**, not
  razed: it keeps its level, it cannot be targeted, it smokes, its crew
  shelters (kept, not dismissed), it produces nothing, pays no tithe and
  recruits nothing.
- **Repair is automatic.** A sacked building starts mending at dawn and is
  whole again after `SACK.repairSeconds` of daylight with no walker within
  `SACK.calmRadius`; the hero standing in it mends it at once; workshop
  builders speed it. No bill.
- **Defenses still fall.** Walls, gates and towers lose levels and leave rubble
  as today: they are what you spend to hold the line. The fortified hall still
  loses tiers, and its fall is still the loss.
- **Holdings call for help.** A holding outside the hold that takes damage
  emits `holding:raided` (at most every 3 s per building); the army (E) and the
  HUD (F) answer it.

### E · Companies and orders (R5)

- Soldiers belong to three **companies** by where they are mustered:
  **infantry** (barracks: swordsman, spearman, guard), **archers** (archery
  range: archer, crossbow) and **riders** (outrider camp: outrider).
- Each company has an **order**:
  - **Defend** (the default). By day the company stands at a post in the hold
    and answers `holding:raided` on claimed ground by sending a detachment
    (half the company, at least two, capped by `ARMY.respondRange` of path)
    that returns when the raid is over. From the warning to dawn it deploys to
    tonight's front posts (C), split by each front's share of the night, melee
    in front of shooters; a front that has gone quiet sends its soldiers to the
    nearest front still fighting; at dawn they walk home.
  - **Follow.** As today: in formation behind the hero, fighting what comes near.
  - **Hold.** At a banner planted where the hero stood when the order was given.
- `H` cycles every company through Defend → Follow → Hold (here); the HUD army
  button opens the orders panel (F). The save keeps the orders and the banner;
  an old save's `holding` flag loads as the defaults.

### F · Orders panel and night awareness (R6)

- **The orders panel**: the army icon button opens a small glass panel, one
  row per company that has soldiers or can muster (count, three order chips).
  Hold plants the banner at the hero. The banner shows in the world while any
  company holds.
- **Threat chevrons**: at night, off-screen walkers on claimed ground show as
  chevrons on the screen edge with a count (clustered); a raided holding shows
  as a chevron with the building's icon, day or night, until it has been quiet
  for a few seconds. The minimap pings raided holdings.
- **The dawn card**: at `night:summary`, a small glass card under the day
  counter for ~6 s: "Night 7 held · 84 slain · +412 coins · swept 120 stone ·
  2 sacked, mending".

### G · Balance and the record (R7)

- The probe (`H.probe`) runs before and after; coins stop being the binding
  constraint in acts I and II. The acts may land up to ~20% earlier than the
  pacing targets in `docs/world/design/01-world.md`, not more.
- README, the Playing table and this folder's STATUS are brought up to date.

## Contracts between cards

Signatures only. A card that changes one updates this list.

| Card | Contract |
|---|---|
| R1 | `TITHE`, `titheRate({ hallLevel, workers, homePop })` in `config/balance.ts`; `village.titheOf(buildings)`; `BuildingManager.titheRate(): number` (coins/s now); `Building.sacked` (false; gates the tithe) |
| R2 | `PickupManager.sweepField(): ResourceBag`; `WaveManager.nightLog: NightLog` (`{ wave, kills, coins, swept, sacked }`, type in `core/Events.ts`); bus `night:summary` (the log) at dawn, after `wave:cleared` |
| R3 | `Enemy.advancing: boolean`; `RegionManager.inHold(x, y): boolean` (pure `inHold` in `Approaches.ts`); `HOLD` in balance; `FRONT_STAGGER`, `POST_BACK`, `frontStagger(plan, id)`, `frontPost(route, hold, back?)` in `Approaches.ts`; `TonightRoute.post: { x: number; y: number }`; `nearestStructure(x, y, r, preferDefense?, holdings?)` |
| R4 | `Building.sacked`; `BuildingManager.isHolding(b)`, `sack(b)`, `restore(b, byHero?)`, `onStruck(b)`, `raided(now: ms): RaidedHolding[]` (`{ padId, x, y, key }`); `SACK` in balance; bus `holding:raided { padId, x, y, key }`, `building:sacked`, `building:restored { padId, key, x, y }`; `nightLog.sacked` counts |
| R5 | `systems/companies.ts`: `Company`, `Order`, `COMPANIES`, `ORDERS`, `ORDER_CALL`, `companyOf(key)`, `nextOrder(o)`, `assignFronts(counts, fronts)`, `Anchor`; `ArmyManager.orders`, `.banner`, `setOrder(c, o)`, `cycleAll(): Order`, `orderCall(o)`, `companyCount(c)`, `follows(s)`, `answer({ padId, x, y })`, `detachments()`, read-only `holding`; `WaveManager.pendingFor(id)`; `ARMY` in balance; save `army.orders`, `army.banner` |
| R6, R6b | UI only |

## If you are an implementing session

1. Read **this file**, then **[STATUS.md](STATUS.md)**, then **your card** in
   [cards/](cards/). Nothing else from `cards/`.
2. Work on branch `rework`. Never push, never merge to `main`: `main` deploys.
3. Do the card. Commit at each checkpoint (C1, C2, …) in the repo's style: an
   evocative imperative subject, a paragraph on why, bullets; end the message
   with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
4. Finish with the handoff: tests, typecheck and lint green; STATUS.md "Next"
   moved and your entry added (≤ 12 lines); contracts above updated if you
   changed one; a final report of **≤ 25 lines**.

## Budget rules (200k per session)

About 35k is gone before you start. Plan the rest: orientation ≤ 15k, reading
code ≤ 50k, doing ≤ 70k, verifying ≤ 10k, reserve ~15k.

- **Never read a file over 15 KB whole.** Grep for the symbol, then read with
  offset and limit. Big ones: `art/buildings.ts`, `art/units.ts`, `ui/skin.ts`,
  `systems/BuildingManager.ts` (~11k tokens), `ui/HUD.ts` (~9k),
  `scenes/GameScene.ts` (~8k), `systems/EnemyManager.ts` (~6k),
  `systems/WorkerManager.ts`, `dev/harness.ts`. Never read
  `config/world/blueprint.ts`; use `node docs/world/tools/render.mjs --region <id>`.
- **Pipe long output**: `npm test 2>&1 | tail -25`, `npm run typecheck 2>&1 | head -30`,
  `npm run world:lint`.
- **Testing is big-picture only** (the human's rule): at each checkpoint run
  `npm test`, `npm run typecheck` and `npm run world:lint` once. Add tests only
  for the card's headline behaviour, a few assertions, preferring pure
  functions (see `tests/load-ts.mjs` for how tests import TS). At most **one**
  browser smoke check per card and at most **two** screenshots at `scale: 0.5`,
  only when the card changes what the player sees. No soak runs, no sweeps.
- **The browser.** Dev server: `preview_start` with name `emberhold` (port 5180).
  Drive `window.H` through `javascript_tool` and return small JSON. **Back up
  the real save first** and restore it from the title screen when done:
  `for (const k of ['emberhold.save.v2','emberhold.save.backup.v2','emberhold.settings.v1']) sessionStorage.setItem('bk:'+k, localStorage.getItem(k) ?? '')`
  (restore: set each non-empty backup back, remove the key where it was empty).
  `H.pump(s)` steps the loop off a fake clock; HMR reloads the page on edits
  (re-run `H.start()`); the pane is often hidden, so take screenshots twice.
  A hidden pane has a 0×0 container and the game never boots: `resize_window`
  to 1280×800 first. The game can auto-pause while hidden between calls
  (`H.probe.run` returns `paused: 'Game'`); a pumped run past that point stalls,
  so do a probe run in as few calls as you can (`run(8)` fits in one, ~20 s).
- **Stop rule.** If you think more than ~70% of your context is used, or your
  conversation was compacted, stop at the next checkpoint: green, commit,
  write a *partial* STATUS entry (`R3 partial: done through C2`), and end.
