# R5 · Companies and orders

**Lands:** an army that defends on its own: three companies, each with an
order (defend, follow, hold); defenders stand at posts in the hold by day, answer
raided holdings, and deploy to tonight's front posts at night. Design: README §E.

## Read

- `src/systems/ArmyManager.ts` and `src/entities/Soldier.ts` (whole; ~5k tokens).
- `src/systems/WaveManager.ts`: `TonightRoute` (with R3's `post`), `phase`,
  `plan`, `splitBudget` use in `beginNight`.
- R4's `holding:raided` and `BuildingManager.raided()`; R3's `RegionManager.inHold`.
- `src/scenes/GameScene.ts`: grep `army.holding` (the `H` toggle, ~line 384).
- `src/ui/HUD.ts`: grep `army.holding` (~line 453) — keep it compiling; R6b
  does the panel.
- `src/dev/harness.ts`: grep `army.holding` (~line 454).
- `src/systems/SaveManager.ts`: grep `army` (validation).
- `src/dev/probe.ts`: grep `army` (the probe drives the army; keep it working).

## Checkpoints

**C1 · Companies, orders, save.**
- `Company`, `Order`, `companyOf(key)` (barracks → infantry, archeryRange →
  archers, stable → riders, from `SOLDIERS[key].from`), `ArmyManager.orders`
  (default all `defend`), `banner: { x, y } | null`, `setOrder(c, o)` (hold
  plants the banner at the hero), `cycleAll()` (defend → follow → hold →
  defend, all companies to the next order after the infantry's),
  `companyCount(c)`.
- `ARMY` in `config/balance.ts`: `engage` (300, follow), `leash` (420,
  follow), `holdEngage` (360), `holdLeash` (480), `postEngage` (480),
  `postLeash` (720), `respondRange` (~2600), `respondMin` (2).
- Keep a read-only `holding` getter (`true` when every company holds) so old
  call sites compile, and move the `H` key to `cycleAll()` with a popup naming
  the new order (`ARMY DEFENDS THE HOLD` / `ARMY FOLLOWS YOU` / `ARMY HOLDS HERE`).
- Save: `orders` and `banner` in `toJSON`; load tolerates their absence (an
  old save's `holding` loads as the defaults); SaveManager validates them as
  optional.

**C2 · Posts and deployment.**
- Each soldier gets an anchor from its company's order, recomputed at most a
  few times a second (not per soldier per frame):
  - follow: today's formation on the hero;
  - hold: the banner, formation facing out from the hall;
  - defend, by day: a day post in the hold. Spread companies round the hall
    (infantry toward the most recent night's main front, archers behind them,
    riders on the flank), or at their muster building if that is simpler;
  - defend, from the warning to dawn: tonight's front posts (`waves.tonight[i].post`).
    Split each defend company across fronts by the front's share of the night
    (the raid counts as a small front), melee in front of shooters. Put the
    split in a pure exported function, e.g.
    `assignFronts(counts: Record<Company, number>, fronts: { id, share }[])`,
    and test it (shares sum, every front with share > 0 gets someone when
    there are enough soldiers, deterministic).
  - A front that has had no live walker within `postLeash` of its post for 6 s,
    and no spawns left for it, releases its soldiers to the nearest front
    that still has walkers; at dawn everyone walks home.
- Engage and leash per anchor kind (from `ARMY`). Long walks use the existing
  `route()` path logic; a soldier far from its anchor sprints as today.

**C3 · Answer raids.**
- On `holding:raided` by day (or at night for a holding no front covers),
  the nearest defend company (by path from its post, within `respondRange`)
  sends a detachment: half its soldiers, at least `respondMin`, not already
  detached. They go to the holding, fight within `postEngage` of it, and go
  back once it has been quiet for 5 s. One detachment per holding.
- Harness: update `harness.ts` (and `probe.ts` if it reads `holding`) to the
  new anchors.
- One harness smoke check: recruit a few soldiers, pump to the warning, and
  report where each company's soldiers are headed vs tonight's posts; then
  raise `holding:raided` on a far farm by day and see a detachment leave.
  Return ≤ 12 lines of JSON. No screenshots (R6b does the visuals).

## Acceptance

- With the default orders, soldiers are at tonight's front posts at night and
  back in the hold by day, with the hero anywhere.
- `H` cycles the orders; follow behaves as before.
- Tests (including `assignFronts`), typecheck and lint green.

## Pitfalls

- Waystone travel escorts soldiers within 500 px; defenders at posts should
  not be dragged along (check `WAYSTONE.escort` use: only followers go).
- Keep path requests bounded: one per soldier at most every second, as `route()` does.
- `LINE_ORDER` sorting is per whole army today; sort within each anchor group.
