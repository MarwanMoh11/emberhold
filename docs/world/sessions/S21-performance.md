# S21 · Performance and mobile

**Goal.** Meet the budgets in [04 §Performance budgets](../design/04-systems.md#performance-budgets-checked-in-s21), on desktop and on a mid-range phone profile, during a three-front late-game night.

**Depends on.** S20 (final content and numbers).

**Already done.** S09b built the compact docked panel (`DockSheet`). Here you only verify it on a phone: 375×812, 44 px targets, and no overlap with the joystick, the hero or the selected building.

**Density.** S13c raised the pads about 2.5× (94 → ~238). The fixture must have every pad built, so it measures the extra buildings, workers (the save caps them at 500), drop-off paths, yard props and lazily baked `bld_` textures (160 at most). Add rows for them to the budget table.

**Size.** Medium. This is measure-first work, so don't pre-read code. Profile, then read only the hot function.

## Read first
- [04-systems.md §Performance budgets](../design/04-systems.md#performance-budgets-checked-in-s21)
- The performance numbers in STATUS from S02, S05, S06, S07 and S12.

## Do

**C1 · A benchmark scene**
1. Add a harness `H.bench()`:
   - load a late-game fixture save (from S19's fixtures, or build one with the probe from S20);
   - trigger a three-front night;
   - for 60 s, record frame times (p50, p95, max), chunk bakes, flow rebuild slices, A* time, visible object count and JS heap.
2. It returns JSON.

**C2 · Fix to budget**
1. Profile with the browser's performance APIs from `javascript_tool`:
   - `performance.now` spans around the systems' `update` calls, behind a dev flag;
   - no DevTools traces pasted into context.
2. Fix the worst offender first. Usual suspects:
   - enemy separation (use the spatial hash);
   - flow direction reads;
   - Culler churn;
   - `Graphics` redraws on the minimap.

**C3 · The mobile profile**
1. Run the bench with the mobile preset viewport and 4× CPU throttling if available (otherwise a reduced `stepMs` budget).
2. Check touch travel, the atlas, the joystick, and S09b's docked panel (`H.panel()`).
3. Reset the viewport afterwards.

## Done when
- The desktop p95 frame time is ≤ 16.7 ms, and the mobile profile's p95 is ≤ 22 ms.
- Every budget row in 04 is met, or listed with its measured value and a reason.
- Tests and typecheck are green.

## Handoff
The budget table filled in with measured values, and what changed.
