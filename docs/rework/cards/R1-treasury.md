# R1 · The treasury

**Lands:** coins that come from time. A tithe on the working and housed
population, banked every second, shown in the HUD; markets that actually turn
the surplus over. Design: README §A.

## Read

- `src/config/balance.ts` (whole; ~7k tokens) and `src/config/buildings.ts`
  (the `townHall`, `market`, `cottage`, `house` entries only).
- `src/systems/BuildingManager.ts`: grep `tickTrade`, `tickMarket`,
  `recomputeBonuses`, `update(` and read those bodies only. The trading post
  and market already bank coins over time; the tithe belongs beside them.
- `src/systems/WorkerManager.ts`: grep for how many workers are hired and
  working (you need a cheap count; a sheltering worker still counts, a
  dismissed one does not).
- How cottage/longhouse population reaches the pop cap: grep `pop` and
  `cottagePopMax` in `BuildingManager.ts`.
- `src/ui/HUD.ts`: grep `coins` / `rate` to find where the coin figure is drawn.
- `src/dev/probe.ts` header and its `report` function, to measure.

## Checkpoints

**C0 · Baseline.** Before any edit, in the browser (back up the save first,
see README): `H.probe.start(); H.probe.run(8)` (repeat `run` until wave 8),
then reduce `H.probe.report()` in JS to ≤ 15 lines: per wave, the game clock,
coins earned that day and night, coins in store, and what the probe was
waiting on. Keep that table for your STATUS entry. If the probe credits kill
loot by a shortcut rather than by pickups, note it.

**C1 · The tithe.**
- `TITHE` in `config/balance.ts`: `hall` coins/s by hall level (index 0 =
  level 1), `perWorker`, `perHome` (per point of population from cottages and
  longhouses), and `popupEvery` (s). Start near `hall: [0.4, 0.8, 1.3, 1.9, 2.6]`,
  `perWorker: 0.12`, `perHome: 0.05`; C3 tunes them.
- `BuildingManager.titheRate(): number` computes the current rate. A building
  whose `sacked` flag is set (R4 adds it; read it as `(b as any).sacked` or add
  the optional field on `Building` now) contributes nothing: write the gate
  so R4 only has to set the flag.
- Bank it like `tickTrade` does: accrue fractions, bank whole coins into
  stores every tick (counted as gathered), and float a quiet `+N coins` over
  the hall every `popupEvery` seconds when the hall is on screen.
- Offline income: grep `offline` in `SaveManager.ts`/`GameScene.ts`; if the
  away-pay is computed from per-building rates, include the tithe.
- Markets: `VILLAGE.market.floor` 300 → 150.
- A short test (`tests/treasury.test.mjs` or beside `village.test.mjs`) that the
  rate grows with hall level, workers and homes, and ignores a sacked building.
  Prefer testing a pure helper (e.g. `titheRate({ hallLevel, workers, homePop })`
  exported from balance.ts or a tiny module) over constructing a scene.

**C2 · Show it.** The HUD's coin figure shows its income a second (from
`res.rate.coins`, which already includes pickups and banked coins), small and
dim beside the number, only when it is at least 0.1. Keep to the smoked-glass
HUD: no new panels, no ornament.

**C3 · Tune.** Re-run the C0 probe to wave 8 and compare. Aim: by wave 5,
coins earned per day+night about **2×** the baseline; the probe's act I end
(wave 8, ~16 min game clock) may come up to ~20% earlier, no more. Adjust
`TITHE` (not costs). Record both tables (≤ 10 lines each) in your STATUS entry.

## Acceptance

- A fresh game with two lumberjacks earns coins with nobody killing anything,
  visibly in the HUD rate.
- Tests, typecheck and world lint green; one browser check is the probe itself;
  no screenshots needed.

## Pitfalls

- `res.addStored(type, n)` counts into `totalGathered`; that is right for the tithe.
- Do not add coins to the worker delivery path: the tithe is one tick, not a
  per-delivery side effect.
- The harness pump runs thousands of ticks; keep the tithe tick allocation-free.
