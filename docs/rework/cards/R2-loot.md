# R2 · Loot is never lost

**Lands:** coins and xp that always reach the hero, a dawn sweep that banks the
night's cargo, and a night log for the dawn card. Design: README §B.

## Read

- `src/systems/PickupManager.ts` (whole, small) and `PICKUP` in `config/balance.ts`.
- `src/systems/WaveManager.ts`: `rout`, `endNight`, `beginNight`, `notifyKilled`.
- `src/systems/CombatSystem.ts`: grep `killEnemy` and `dropLoot` (where kill
  loot and kill counts come from).
- `src/systems/RegionManager.ts`: `claimedAt` / the claim mask helpers (grep
  `Whether the ground under a point is claimed`).

## Checkpoints

**C1 · Coins and xp come home.**
- After a coin or xp pickup's bounce (`vz === 0` and `z === 0`, or ~0.35 s),
  it magnetises to the hero wherever it is, as long as the hero is alive and
  within `PICKUP.homeRange` (new, ~1400 px). Outside that, or while the hero is
  down: coins bank straight into stores and xp is credited at
  `PICKUP.farXp` (new, 0.5) of its value, at drop time, with no sprite.
- If the pool is full (`maxActive`), coins and xp are credited the same way
  instead of being dropped on the floor.
- Hearts and chests keep today's rule. Cargo keeps today's rule (pack space,
  pickup radius) by day.

**C2 · The dawn sweep.**
- `PickupManager.sweepField(): ResourceBag`: every active cargo pickup (wood,
  food, stone, metal, crystal) standing on claimed ground goes into stores and
  is released; returns what moved. Coins still on the ground go too.
- `WaveManager.rout()`: walkers that flee put their loot straight into the
  night's sweep (bank it; no pickups spawned) instead of dropping it.
- `WaveManager.endNight()`: call `sweepField()`; one popup line near the hero,
  e.g. `swept from the field: +120 stone, +40 wood` (skip it if empty). The old
  `collectAllInRadius(…, 900)` call can go.
- Cargo on claimed ground does not lose `life` while it is night.

**C3 · The night log.**
- `WaveManager.nightLog = { wave, kills, coins, swept, sacked }`, reset in
  `beginNight`; `kills` counts wave walkers killed, `coins` counts coins
  banked or picked up from dusk to dawn (the reward included; hook
  `res:changed`-free: count at the sources, or diff `res.totalGathered.coins`
  between dusk and dawn, which is simplest), `swept` is the sweep's bag,
  `sacked` stays 0 (R4 increments it).
- Emit `night:summary` with the log at the end of `endNight`. Add the event's
  type wherever the bus's event map lives (grep `'wave:cleared'` in `core/`).
- A test: `sweepField` banks cargo on claimed ground and leaves cargo off it
  (a pure helper over a list of `{kind, amount, x, y}` and a `claimed(x, y)`
  function is the cheap way).

## Acceptance

- In one harness smoke check: start, kill a few walkers far from the hero
  (`H.gs().enemies.spawn(...)` then `H.gs().combat.killEnemy(e)` at 2000 px),
  and the coin store rises with no pickup left behind; pump through a night
  and the log comes out in `night:summary`. Return ≤ 10 lines of JSON.
- Tests, typecheck and lint green. No screenshots.

## Pitfalls

- `PickupManager` is also constructed in test scenes (`scene.culler?.`); guard
  any new scene access the same way.
- `collect()` for coins goes through `res.pickUp`, which banks coins; reuse it.
- Keep the per-pickup loop allocation-free; it runs for up to 900 pickups.
