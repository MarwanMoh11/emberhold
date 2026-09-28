# Rework status

**Next: R5 · Companies and orders** and **R6 · Night awareness** in parallel, then **R6b · Orders panel**, then **R7**.

Parallel mode (human, 2026-09-28): cards may run at once in worktrees under `.claude/worktrees/rN` (branch `rework-rN`, dev server `emberhold-rN` in `.claude/launch.json`); each writes `docs/rework/handoff/RN.md` and the orchestrator merges into `rework` and writes the entry here.

Branch `rework`, cut from `main` at `479df80`. After R1–R4: 176 tests green,
typecheck clean, world lint 0/0.

## Open decisions

- None yet.

## Entries

<!-- newest last; ≤ 12 lines each; prune entries three or more cards old to one line -->

**R1 · The treasury: done.** `TITHE` kept at the card's start values (hall 0.4…2.6, perWorker 0.12, perHome 0.05, popup 10 s); `village.titheOf(buildings)` is the pure count, `BuildingManager.titheRate()` wraps it, recounted 1/s. `Building.sacked` exists (false) and already zeroes a building's tithe: R4 only sets it. Away-pay includes the tithe; market floor 150; HUD coin rate dim from 0.1/s.
Probe to wave 8, coins earned per day+night and in store, baseline → after:
| wave | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| earned | 158→245 | 64→154 | 56→205 | 145→310 | **177→355** | 203→435 | 199→559 | 118→946 |
| store | 206→293 | 300→410 | 272→333 | 474→362 | 413→779 | 419→1075 | 406→553 | 460→2086 |
Before: hall Lv1 all 8 waves, waiting on a10 (burn the Diggers) from w4, one claim. After: hall Lv2 at w7, whisperwood claimed w7, on a14 (act I's last quest) at w8. Wave 8 at 14.6 → 14.9 min (claims lengthen days); act I not over at w8 in either run, so no early landing.
Probe kill loot is by real pickups, no shortcut; the night reward was most of the baseline's coins.

**R2 · Loot is never lost: done** (worktree, merged 5dab500). Coins/xp fly home within `PICKUP.homeRange` 1400 after the bounce; beyond it or with the hero down, coins bank and xp is owed at `farXp` 0.5 (paid when the hero stands). Dawn sweep banks cargo on claimed ground (`sweepField`); routed walkers bank their loot; cargo on claimed ground doesn't rot from the warning to dawn. `nightLog` (in `core/Events.ts` as `NightLog`) opens at dusk; `night:summary` after `wave:cleared`. `nightLog.coins` = gathered-coin growth since dusk + the reward (tithe included). `collectAllInRadius` removed.

**R3 · The march holds its course: done** (worktree, merged 167211a). Front walkers on claimed ground advance (`acquireAdvance`: hero/ally within 220 or 440 just after a close hit, a structure within 110, else the hall); assault as before once `inHold`. Raids weight holdings 0.5. `FRONT_STAGGER` 10 s lives in `Approaches.ts` (with `frontStagger`, `frontPost`, `POST_BACK` 160). Posts sit ~1200–1300 px from the hall on the south and west roads (the hold region reaches past 900). Smoke: 0 far-structure targets in 2108 samples; advancing walkers still hit roadside holdings within 110 px (R7 may shrink `advanceBump`).

**R4 · Sacked, not razed: done** (worktree, merged baabb13). Holdings sack at 0 hp (level kept, `alive = false`, untargetable, enemies walk through, allies collide; tinted, smoking, crew sheltered, nothing produced/paid/trained/lent). Mend in calm daylight over `SACK.repairSeconds` 25 (+engineers), or at once when the hero stands in them 1.2 s. `onStruck(b)` from `CombatSystem.damageAlly`; `holding:raided` outside the hold (every 3 s per building), `raided(now)` (scene.now ms). Side effects: auto-hire needs a *standing* warehouse; a sacked depot sends hauls to the hall; `Building.repair` no longer revives a sacked building.
- Merge: R4's stand-ins replaced by `regions.inHold` and `waves.nightLog.sacked++`; one `sacked` field. Test stubs need `regions.inHold`.
- Flaky: one full `npm test` run failed once in R2's worktree and once here after the R3 merge; not reproduced in 6+ reruns. Unknown test.
