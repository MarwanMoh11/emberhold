# Rework status

**Next: R2 · Loot is never lost** ([cards/R2-loot.md](cards/R2-loot.md))

Branch `rework`, cut from `main` at `479df80`. After R1: 166 tests green,
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
