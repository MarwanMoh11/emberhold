# S09b · Walls without gaps, and compact panels

**Goal.** Two fixes from the human's playtest (2026-09-24):
- Every built wall line reads as continuous and **is** continuous: to the eye, to the NavGrid and to the collision boxes. That covers horizontal and vertical runs, gate joins and corners.
- The build, upgrade and buy panels shrink into a docked, collapsible sheet that never covers the selected building or the hero. The sheet's skin tokens and components become the style for every later panel.

**Depends on.** S05 (wall blockers), S08 (the border stone) and S09 (the night warning bands in the HUD).

**Size.** Medium to large, in two halves: walls (C1–C2), then panels (C3–C4). If the budget runs short, stop cleanly after C2.

## What is wrong today (diagnosed from the code, 2026-09-24)

**Art.**
- `DRAW.wall` in `src/art/buildings.ts` (~:913) paints one horizontal run: stakes across about 64 px, or a 60 px stone box. `generateWalls` in `BuildingManager` (~:143) stamps that same sprite down the left and right sides every 62 px. A vertical run therefore reads as a ladder of separate fence pieces, each about 30 px tall, with ground showing between them.
- `generateWalls` drops every wall pad within 96 px of a gate (`gapNear`), and the gates are not on the 62 px lattice. Beside `gateN` (x 5120) the nearest walls sit at 4976 and 5224, so there is a gap of about 20 px on one side and an overlap on the other. On the east and west sides the gate is drawn facing the viewer, with gaps of about 60 px above and below it.
- Corners: the ring is laid from its bounding box. The top row stops at x 5720, not the 5760 corner. The bottom-left corner gets two pads 4 px apart. No piece is made to turn a corner.

**Nav and collision.**
- NavGrid: `syncNav` (~:520) registers one disc of 40 px (`WALL_BLOCK_RADIUS`) per wall pad. That is continuous on straight runs at a 62 px step. But `syncNav` ignores gates, and the 96 px skip leaves one or two cells beside each gate with no wall cost. The flow field goes past the side of the gate, not into it.
- Collision: `Building` sets `halfW = def.w / 2` (30) and `halfH = def.h / 2` (14) whatever the orientation. `blockerAt` and `resolveCollision` use `halfH × 0.7` (about 10 px). On a vertical run the boxes cover about 20 px of every 62, so any walker with a body radius under about 21 px slips between them. That is every walker (`walkRadius` ≤ 12).

## Read first
- [CONTRACTS.md §S05 and §S09b](../CONTRACTS.md#s09b-walls-and-panels)
- `src/systems/BuildingManager.ts`: `grep -n "generateWalls\|syncNav\|WALL_BLOCK_RADIUS\|blockerAt\|resolveCollision\|panel"`. Read those functions only.
- `src/entities/Building.ts` (whole, about 1.4k tokens): footprint (`halfW`/`halfH`) and texture choice (~:121).
- `src/art/buildings.ts`: `DRAW.wall`, `DRAW.gate`, `paintBuilding`, `texSize`, `buildBuildingTextures` (grep; about 2k tokens). Nothing else.
- `src/world/NavGrid.ts`: `setBlocker` (~:204) only.
- `src/systems/SaveManager.ts`: `maxLevelForPad` (~:24).
- `src/ui/BuildingPanel.ts` (whole, about 4k tokens) and in `src/ui/skin.ts` only `SkinPanel`, `PlateButton` and the tokens at the top (grep `^export`).
- `src/ui/HUD.ts`: `grep -n "uiBands\|Joystick\|dodge"` for the bands the sheet must clear.
- `src/systems/RegionManager.ts` ~:175–260: the border stone's card (`BANNER_W`), which is the "buy" panel.
- `node docs/world/tools/render.mjs --region hold` for the palisade and the bridgehead.

## Do

**C1 · Walls laid by line, and a gap check**
1. Add `src/world/wallLine.ts` (pure, `loadTs`-testable): `layWallLine(line: WallLineBP) → WallPiece[] { id, key: 'wall' | 'gate', part: 'run' | 'post', dir: 'h' | 'v', x, y, len }`.
   - Split the polyline at its vertices and at each gate. A gate takes its own width, with a **post** (a `wall` piece, `part: 'post'`) on each jamb.
   - Every vertex gets a post.
   - Each run between two stops gets `n = ceil(runLength / step)` pieces, spaced evenly, so no spacing exceeds `step` and the pieces meet the posts exactly.
   - `dir` comes from the segment: `h` when |dx| ≥ |dy|, else `v`.
   - Ids are `${line.id}.${k}` (S10's contract, landed early). Gates keep their blueprint ids.
2. `generateWalls` lays the palisade through `layWallLine` (still only the palisade; S10 lays the rest). Wall pieces carry `dir` and `part` on their `PadSpec`.
3. Footprints follow the piece. `Building` swaps `halfW` and `halfH` for `dir: 'v'`, and sizes a post as a square. `blockerAt` and `resolveCollision` then cover the whole run.
4. NavGrid: each built wall piece registers a **capsule** along its length (discs every 16 px, radius 28), not one disc at its centre. A cell the line touches has its centre within about 23 px of the line (half a 32 px cell's diagonal), and so within about 24 px of a disc centre: 28 leaves a margin. The cells beside a gate come from its posts. Gates stay out of the grid: the horde still funnels to the gate and breaks it.
5. Saves:
   - `maxLevelForPad` accepts `${line}.${k}` ids, and still accepts `wall\d+`.
   - On load, remap a saved `wall\d+` entry to the nearest new piece within 40 px, so the human's playtest ring survives.
6. The gap check, in two places:
   - **Node test** `tests/wall-line.test.mjs`, for **every** line in `WALLS` (not only the palisade):
     - no two neighbouring pieces are more than `step` apart;
     - every vertex has a post, and every gate has two;
     - with every piece registered on a real `NavGrid`, every raster cell the polyline passes through is either blocked or under a gate's box. The NavGrid forbids diagonal moves past a wall's edge, so this is enough to rule out a passable gap.
   - **Harness** `H.wallGaps(lineId = 'palisade') → { pieces, built, navLeaks: Pt[], bodyLeaks: Pt[] }`. First build the line (a dev helper `H.buildLine(id, lvl)`), then walk the line every 4 px:
     - a nav leak is a sample whose cell is neither blocked nor under a standing gate;
     - a body leak is a sample where `blockerAt(x, y, 8)` finds nothing, using the smallest walker body.

**C2 · Wall art that meets**
1. Add the textures the pieces need, for every level:
   - `bld_wall_v_${lvl}`: a run seen end-on. Level 1 is stakes receding up the screen; levels 2+ are the stone box's side face and wall-walk.
   - `bld_wallpost_${lvl}`: a corner and jamb piece (a stake cluster, or a stone pier).
   - `bld_gate_v_${lvl}`: the gatehouse turned side-on.
2. Overlap rule: each piece's art overruns its spacing by at least 4 px at each end (a horizontal piece's width ≥ step + 8; a vertical piece's height ≥ step + 8). Pieces are depth-sorted by y, so a lower vertical piece hides the top of the one above.
3. `Building` picks its texture from `dir` and `part`. The build-site blueprint ghost follows the same rule.
4. Posts sit over the run ends on either side, so a corner reads as one turned wall and a gate reads as set into the wall.

**C3 · A compact, docked sheet (skin)**
Add these to `src/ui/skin.ts`, or to a new `src/ui/dock.ts` that skin re-exports. Later panels (fishery, trading post, relics, the new buildings of S13b) use only these.
1. **`DOCK` tokens:**
   - `gutter` 16, `pad` 10, `touch` 44 (minimum hit size, CSS px), `rowH` 28;
   - `collapsedH` 64, `sideW` 300;
   - `phoneMaxFrac` 0.30 and `deskMaxFrac` 0.20 (of the viewport, expanded);
   - `titleSize` 15 and `bodySize` 13 (never under 12 at 375 px wide).
2. **`DockSheet`**, a screen-space container on the HUD's `ui` scene. It is **not** in world space and doesn't counter-scale by zoom.
   - In portrait it docks as a **bottom sheet**: full width less the gutters, above `uiBands.bottom` (so the joystick and dodge button stay free). In landscape and on desktop it docks to the **right edge**, between `uiBands.top` and `uiBands.bottom`.
   - It has two states, **collapsed** (one row: the title, the level, the primary action, and a chevron to expand) and **expanded** (up to its max fraction; longer content scrolls inside).
   - Collapsed is the default on phones. The last state is remembered per session.
   - It publishes its rect as `uiBands.dock`, so the HUD and the camera can avoid it.
3. **`CostChips`**: an icon with `have/need` inline, with red for the short resources. It replaces the tall bar rows in cost displays.
4. **`StatLine`**: one line of effect, such as "+0.6 coins/s", "+15% food within 600 px" or "heals 2 hp/s".
5. **`PlateButton` `size: 'compact'`**: 44 px tall on touch, 36 px with a mouse.

**C4 · Panels on the dock**
1. `BuildingPanel` renders `PanelView` into a `DockSheet`, and `PanelView` itself doesn't change, so `BuildingManager` is untouched apart from wiring.
   - Collapsed: the title and the primary action (the upgrade commit, or the funding progress while you stand on a build site).
   - Expanded: `CostChips`, the unit chips, the hint and the hold-to-demolish bar.
2. **The camera.** While the sheet is open, shift the main camera's follow offset so the hero and the selected building sit in the middle of the clear area. Ease it back when the sheet closes.
3. **The border stone's card** (the claim cost: the "buy" panel) uses the same `DockSheet` when the hero stands at the stone. The world label over the stone shrinks to the region's name.
4. Keep every action reachable:
   - upgrade (committing it);
   - picking a unit;
   - hold-to-demolish;
   - paying at a build site or a claim stone (by standing there);
   - collapsing and expanding.
5. Add a harness helper `H.panel() → { rect, viewport, frac, collapsed, building, hero, overlapsBuilding, overlapsHero, targets: { name, w, h }[], minFont }`, with rects in CSS px.

## Out of scope
- The other `WALLS` lines (S10 builds them with `layWallLine`).
- Wall costs and hp (S20).
- New panel content for later buildings.
- The atlas and the minimap.

## Done when
- **Walls:**
  - `tests/wall-line.test.mjs` passes for every line in `WALLS`;
  - in the harness, `H.wallGaps('palisade')` returns `navLeaks: []` and `bodyLeaks: []` at levels 1 and 3, including after a load from a save with old `wall\d+` ids;
  - a grunt sent at the sealed ring (all four gates built) attacks a wall or gate and never ends up inside without breaking one (`H.march`, JSON).
- **Panels** (`H.panel()`):
  - expanded at 375×812: `frac ≤ 0.30`; on desktop at 1280×800 and 1920×1080: `frac ≤ 0.20`;
  - `overlapsBuilding` and `overlapsHero` are false in both states, on a hall, a barracks with unit chips, a wall piece and the Downs border stone;
  - every entry in `targets` is at least 44×44 at 375×812, and `minFont ≥ 12`;
  - each action above fires its handler when tapped (synthesised pointer events at the target centres).
- Tests, typecheck and `world:lint` are green.

## Verify
- Harness JSON for every rule above. Back up the real save first.
- **Screenshots (4 at most):**
  - two at **1×** (`scale: 1`), cropped with `zoom`: the palisade's west side (a vertical run through a corner) and the join at `gateW`;
  - two at `scale: 0.5`: the sheet expanded at 375×812 over the barracks, and docked on desktop.
- Reset the viewport afterwards.

## Handoff
- CONTRACTS §S09b marked as landed: `layWallLine`, the `WallPiece` fields, `DockSheet`, `DOCK`, `CostChips`, `StatLine`, `H.wallGaps`, `H.buildLine` and `H.panel`.
- Note for S10: the palisade's piece count and ids, and that `WALL_RING` can go once S10 lays every line.
- A Save fields row if the remap of `wall\d+` stays in the loader.
