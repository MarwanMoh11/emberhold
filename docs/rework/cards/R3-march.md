# R3 · The march holds its course

**Lands:** wave fronts that converge on the hold instead of chewing through the
countryside, raids that are the countryside's threat, fronts that arrive one
after another, and a post on every front. Design: README §C.

## Read

- `src/systems/EnemyManager.ts`: `acquire`, `acquirePatrol` (do not change
  patrols), the march/claim transition in `update` (grep `the night's approach`),
  `march(`, `advanceLeg(`, `sight(`, `latch(`, and how a walker with a target
  but no line of sight moves (grep `hallField`). ~6k tokens; read in slices.
- `src/entities/Enemy.ts` (fields only: `marching`, `route`, `approach`, `fromWave`).
- `src/systems/WaveManager.ts`: `beginNight`, `routesFor`, `TonightRoute`, the
  night timeout in `update`.
- `src/systems/Approaches.ts`: `isRaid`, `marchRoute`, `splitBudget`.
- `src/systems/RegionManager.ts`: `claimedAt`, `regionAt` (grep the doc lines).
- `docs/world/design/03-nights-and-camps.md` §Spawning (only if needed).

## Checkpoints

**C1 · Advance, then assault.**
- `HOLD` in `config/balance.ts`: `assaultRadius` (~900 px from the hall),
  `advanceSight` (~220: the hero or a soldier this near is fought),
  `advanceBump` (~110: a structure this near is in the way).
- `RegionManager.inHold(x, y)`: in the `hold` region, or within
  `HOLD.assaultRadius` of the hall.
- `Enemy.advancing`: set when a wave walker from a *front* (not a raid) leaves
  its march on claimed ground; cleared once it is `inHold`. Check it cheaply
  (the region raster lookup is O(1); do it on the walker's retarget timer, not
  every frame, if it costs).
- While advancing, the walker acquires only: the hero within `advanceSight`
  (or whatever last damaged it: grep how a marcher notices being hit), a
  soldier or worker within `advanceSight`, a non-sacked structure within
  `advanceBump`; otherwise it heads for the hall along the hall flow field,
  and the existing wall latch still makes it attack the wall the field routes
  it through. Bosses and `prefers: 'player'` walkers keep hunting the hero.
- Raid walkers and camp patrols keep today's `acquire` and `acquirePatrol`.
  Raids should prefer holdings: when a raid walker picks a structure, weight
  non-defense buildings over walls/towers (a multiplier in `nearestStructure`'s
  scoring via a new optional argument).

**C2 · Staggered fronts and posts.**
- `FRONT_STAGGER` (~10 s, in `config/balance.ts` or `Approaches.ts`): front
  *i* (in `plan.fronts` order; the raid goes with front 0) has its spawn `at`
  times offset by `i × FRONT_STAGGER`. The night's timeout stretches by the
  largest offset. The first front still arrives as fast as today.
- `TonightRoute.post: { x, y }`: the point on the route (`route` runs from the
  spawn to the hall, one point per 32 px cell) where it first enters the hold
  (`inHold`), stepped back ~160 px of route so the army stands just outside;
  if the route never enters it, the last route point before the hall. Put the
  search in a pure exported function (`frontPost(route, inHold)`) and test it.

**C3 · Wire and check.**
- Everything still reads the fight start the same way (`waves.arrived`).
- One harness smoke check: pump to a night with a front, sample a few
  advancing walkers' targets mid-way (they should be the hall or something
  within the bump radius, not a far farm), then confirm the night ends. Return
  ≤ 10 lines of JSON. No screenshots.

## Acceptance

- A front walker crossing a claimed region does not detour 700 px to a farm; a
  raid walker does.
- On a two-front night the second front's first spawn is ~`FRONT_STAGGER` s
  after the first's.
- Tests (including `frontPost`), typecheck and lint green.

## Pitfalls

- `acquire` falls back to the hall; an advancing walker with no target must
  still move, so return the hall rather than null.
- Walkers shot by towers from beyond `advanceSight` should not turn and chase
  the tower; they keep advancing (towers are in the hold anyway).
- `R4` adds `Building.sacked`; skip sacked buildings where you pick
  structures if the field already exists, otherwise leave a one-line TODO for
  R4 in STATUS.
