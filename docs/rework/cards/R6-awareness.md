# R6 · Orders panel and night awareness

**Lands:** the orders panel behind the army button, the hold banner in the
world, edge chevrons for walkers and raided holdings, a minimap ping, and the
dawn card. Design: README §F. The UI direction is minimal smoked glass
(`src/ui/skin.ts`): corners, small, no ornament, the world brightest.

## Read

- `src/ui/HUD.ts`: the icon-button row (grep `icon buttons`, `army`) and how
  a small glass surface is made (grep `hud` skin use). Read in slices.
- `src/ui/skin.ts`: only the exported API list (grep `^export`), and the
  `PlateButton` / glass helpers you use.
- `src/scenes/GameScene.ts`: the edge markers (grep `edgeMarkers`, ~lines 138,
  238, 697–722).
- `src/ui/Minimap.ts`: grep for how approach markers or pings are drawn.
- `src/scenes/UIScene.ts`: how the HUD and overlays are created and laid out
  (`uiBands`).
- R5's `ArmyManager` API (`orders`, `setOrder`, `banner`, `companyCount`),
  R4's `BuildingManager.raided(now)`, R2's `night:summary`.
- `src/art/icons.ts` / `src/art/props.ts`: grep for an existing banner or
  flag texture before painting one.

## Checkpoints

**C1 · The orders panel and the banner.**
- The army icon button opens a small glass panel beside the icon row: one row
  per company with soldiers or an available muster building: its name, its
  count, three chips (Defend, Follow, Hold). The lit chip is the order. Hold
  plants the banner at the hero. Tapping outside or the button again closes
  it. It must work by touch at phone width (375 px), and with a mouse; `H`
  still cycles all companies without opening it.
- The icon itself reflects the orders (all defend / all follow / all hold /
  mixed), as it reflects follow/hold today.
- The banner: a small painted standard (reuse an existing texture if one fits)
  at `army.banner` while any company holds, depth-sorted like a prop.

**C2 · Chevrons and pings.**
- Extend the edge markers: at night, cluster live walkers on claimed ground
  that are off screen (a coarse grid, e.g. 600 px cells, top 4 clusters) and
  show a chevron on the screen edge toward each, with a count. By day and
  night, each holding in `buildings.raided(now)` that is off screen shows a
  chevron in the warning colour. Pool the markers; update at ~5 Hz, not every
  frame.
- The minimap pings a raided holding (a small pulsing dot).

**C3 · The dawn card.**
- On `night:summary`, a small glass card under the day/objective block at
  top centre for ~6 s, one or two lines: `Night 7 held · 84 slain · +412
  coins`, then `swept 120 stone, 40 wood · 2 sacked, mending` (omit empty
  parts). Fades in and out; never blocks input.
- One browser smoke check (back up the save first): start, recruit a couple of
  soldiers, open the panel and set archers to Hold, pump to a night and past
  dawn. Up to **two** screenshots at `scale: 0.5`: the panel open, and a night
  with chevrons or the dawn card. Check the console for errors.

## Acceptance

- The panel works at 375 px wide and on desktop; orders change what soldiers do.
- Chevrons point at off-screen walkers at night and at raided holdings.
- The dawn card appears after a night and goes away.
- Tests, typecheck and lint green.

## Pitfalls

- The HUD is painted, not drawn: use the cached skin textures, not per-frame
  Graphics paths (see README §Performance notes in the repo root).
- Phone portrait has no corner to spare: the panel may overlay the play area
  while open; that is fine.
- Input: taps on the panel must not also move the hero (the joystick owns the
  left half; check how the pause menu guards this).
