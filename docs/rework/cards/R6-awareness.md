# R6 · Night awareness

**Lands:** edge chevrons for off-screen walkers and raided holdings, a minimap
ping, and the dawn card. Design: README §F (the orders panel and banner are
R6b's). The UI direction is minimal smoked glass (`src/ui/skin.ts`): corners,
small, no ornament, the world brightest.

## Read

- `src/scenes/GameScene.ts`: the edge markers (grep `edgeMarkers`, ~lines 138,
  238, 697–722): how they are pooled, placed and textured.
- `src/ui/Minimap.ts`: grep for how approach markers or the hero are drawn.
- `src/ui/HUD.ts`: the top-centre day/objective block (grep `objective`,
  `uiBands`) and how a small glass surface is made (grep the `hud` skin use).
  Read in slices.
- `src/ui/skin.ts`: only the exported API (grep `^export`).
- `src/scenes/UIScene.ts`: how the HUD and overlays are created and laid out.
- R4's `BuildingManager.raided(now)` (`now` = `scene.now`, ms), R2's
  `night:summary` (`NightLog` in `core/Events.ts`), `RegionManager.claimedAt`
  (or the claim mask).
- `src/art/icons.ts`: grep for building icons you can reuse on a chevron.

## Checkpoints

**C1 · Chevrons.**
- Extend the edge markers: at night, cluster live walkers on claimed ground
  that are off screen (a coarse grid, e.g. 600 px cells, the top 4 clusters by
  count) and show a chevron on the screen edge toward each, with a small count.
- By day and night, each holding in `buildings.raided(now)` that is off screen
  shows a chevron in the warning colour with the building's icon if one
  exists (else a plain warning chevron).
- Pool the markers; recompute at ~5 Hz, not every frame; nothing allocates per
  frame. Keep today's approach markers working (they show during the warning).

**C2 · Pings and the dawn card.**
- The minimap pings a raided holding (a small pulsing dot, cheap: a flat
  rectangle or a pooled image, not a per-frame circle path; see the Minimap's
  own note on why).
- On `night:summary`, a small glass card under the day/objective block at top
  centre for ~6 s, one or two lines: `Night 7 held · 84 slain · +412 coins`,
  then `swept 120 stone, 40 wood · 2 sacked, mending` (omit empty parts). It
  fades in and out and never blocks input. Works at 375 px wide.

**C3 · Check.**
- One browser smoke check: start, claim or fake a claimed region with a
  holding, pump to a night with walkers, sample the chevron state, raise a
  raid on a far holding (damage it, or emit via `buildings.onStruck`), then
  pump past dawn and confirm the dawn card showed. Up to **two** screenshots at
  `scale: 0.5` (a night with chevrons; the dawn card). Check the console.

## Acceptance

- Chevrons point at off-screen walkers at night and at raided holdings.
- The dawn card appears after a night and goes away.
- Tests, typecheck and lint green.

## Pitfalls

- The HUD is painted, not drawn: use cached skin textures, not per-frame
  Graphics paths (README §Performance notes in the repo root).
- R6b (in parallel or after you) adds an orders panel next to the top-right
  icon row and a banner sprite; stay out of the icon row.
