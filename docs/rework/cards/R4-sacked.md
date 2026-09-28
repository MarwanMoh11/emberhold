# R4 · Sacked, not razed

**Lands:** holdings that are knocked out for the night instead of unbuilt, that
mend themselves by day, and that call for help. Design: README §D.

## Read

- `src/entities/Building.ts` (whole, small): state, hp, `alive`, `toJSON`/load.
- `src/systems/BuildingManager.ts`: `onBuildingDestroyed`, `nearestStructure`,
  `recomputeBonuses`, the per-frame `update`, the stand-in interaction (grep
  `standing` / `interact` / the building panel hint), `titheRate` (R1),
  `tickTrade`/`tickMarket`, training (grep `trains`), `load`. Read in slices.
- `src/systems/WorkerManager.ts`: the shelter logic (grep `shelter`) and where
  a worker gathers and delivers.
- Where buildings take damage: grep `applyDamage` in `src/entities/Building.ts`
  and callers in `EnemyManager.ts` / `CombatSystem.ts`.
- `src/systems/SaveManager.ts`: the building record validation only.
- `tests/building-recovery.test.mjs` (it tests the rubble rule you are changing).

## Checkpoints

**C1 · Sack.**
- `SACK` in `config/balance.ts`: `repairSeconds` (~25), `calmRadius` (~500),
  `raidedEvery` (3 s), `raidedShow` (~6 s).
- `BuildingManager.isHolding(b)`: built, not `category === 'defense'`, not the
  hall.
- In `onBuildingDestroyed`: a holding is **sacked** instead: `sacked = true`,
  level kept, hp 0, `alive` stays as collision needs it (check what `alive`
  gates: collision, targeting, bonuses) and targeting skips sacked buildings
  (`nearestStructure`, and any ally-grid query that can pick a building).
  Popup `FARM SACKED` in the danger colour, smoke, no rubble, crew kept
  (sheltered, not dismissed). `nightLog.sacked++` if R2's log exists.
  Defenses and the hall keep today's rule.
- While sacked a building produces nothing, pays no tithe, sells/trades
  nothing, trains nothing, lends no bonus (treat it as level 0 in
  `recomputeBonuses`, then recompute on restore).
- Emit `building:sacked` / `building:restored` (add them to the bus's event map).

**C2 · Mend.**
- By day, a sacked building with no walker within `calmRadius` gains
  `maxHp / repairSeconds` hp a second (workshop builders already repair
  damaged buildings: let them count toward it if that is free); at full hp it
  is restored: `sacked = false`, crew back to work, bonuses recomputed, a quiet
  `restored` popup.
- The hero standing in a sacked building restores it at once (the same
  stand-in interaction as building; a short channel like the demolish hold is
  fine), with a hint on its panel: `sacked · mending, or stand here to restore`.
- Visuals: a sacked building is darkened (tint) and smokes every ~1.5 s while
  on screen (`fx.smoke`); cheap.
- Save: `sacked` on the building record, validated as optional boolean; a
  sacked building loads sacked with its hp.

**C3 · Call for help.**
- A holding outside the hold (`!regions.inHold(x, y)`, from R3) that takes
  damage emits `holding:raided { padId, x, y, key }`, at most once per
  `SACK.raidedEvery` per building, and is remembered for `raidedShow` s:
  `BuildingManager.raided(now)` returns the ones raided recently (for R5's
  army and R6's chevrons). Also a single danger popup/sound at most every ~8 s
  overall, so the player hears it.
- Update `tests/building-recovery.test.mjs` to the new rule: a farm at 0 hp is
  sacked with its level; a wall at 0 hp still drops a level; a sacked building
  mends to restored. Keep it to a few assertions.

## Acceptance

- One harness smoke check: set a built farm's hp to 1 and damage it: it is
  sacked, keeps its level, its workers shelter; pump a day and it is restored
  and working. Return ≤ 10 lines of JSON. One screenshot of a sacked building
  is allowed, not required.
- Tests, typecheck and lint green.

## Pitfalls

- `alive` is read by collision (`blockingAt`), bonuses and targeting; decide
  per use rather than flipping it.
- The hall's `onCoreLost` path must not change.
- `peakWorkers` / auto-rehire logic must not fire for a sacked building's crew
  (they were never dismissed).
