# S12 · Minimap and atlas

**Goal.**
- The minimap becomes a local 2400 px window.
- A full-screen atlas replaces the "whole-world minimap": regions, claims, what has been seen, tonight's routes, and waystone travel by clicking.

**Depends on.** S07 (the painter, for the atlas bake), S08 (claims), S09 (routes) and S11 (waystones).

**Size.** Medium to large. `Minimap.ts` is about 6k tokens, and you may read it whole: you are reworking it. **Don't** read `skin.ts` whole (11k): grep for the parchment and panel helpers the minimap already uses.

## Read first
- [04-systems.md §Minimap and atlas](../design/04-systems.md#minimap-and-atlas-s12)
- [CONTRACTS.md §S09, §S11 and §S12](../CONTRACTS.md#s12-minimap-and-atlas)
- `src/ui/Minimap.ts` (whole).
- The `M` key and Back-button binding: `grep -rn "Minimap\|toggleMap\|'M'" src/scenes src/ui | head`.
- `src/ui/skin.ts`: only the helpers `Minimap.ts` imports.

## Do

**C1 · Local minimap**
1. The minimap shows a 2400 px radius around the hero, fed by a low-resolution copy of the terrain.
2. Overlays:
   - fog;
   - pads, in their colours;
   - camps and POIs, once seen;
   - enemies as dots;
   - tonight's routes, dotted during the warning and the march.
3. North stays up. Keep today's frame.

**C2 · Atlas bake**
1. At boot, after the visible chunks, bake the world at 1/16 scale (640 × 576) through the painter in low-detail mode, time-sliced.
2. Re-bake a region's rect on claim (the tint).

**C3 · Atlas UI**
1. `M` or Back toggles the full-screen atlas: a parchment page with the world bake.
2. Overlays:
   - fog;
   - borders and names of explored regions;
   - claim state;
   - seen camps (burned ones crossed out);
   - seen POIs, with icons;
   - outposts and waystones;
   - tonight's routes;
   - the hero;
   - the old world's footprint, shown faintly once as an easter egg (optional).
3. Pan and zoom by drag and pinch.
4. Clicking an active waystone while standing on one travels there. This replaces S11's list, which you may keep for the controller.
5. The quest arrow uses the atlas route when its target is off-screen.

## Out of scope
POI icons for kinds that S14 hasn't built yet: draw generic markers.

## Done when
- The minimap's cost is at most today's.
- The atlas opens in ≤ 100 ms after boot has finished baking.
- Travel works from the atlas on desktop and by touch, using a mobile-emulated viewport in the browser pane.
- A controller can open the atlas and travel.
- Tests and typecheck are green.

## Verify
Take three screenshots at `scale: 0.5`: the local minimap, the atlas zoomed out, and the atlas on a mobile viewport. Reset the viewport afterwards.

## Handoff
- CONTRACTS §S12 marked as landed.
- The atlas bake time.
- The POI icon hook for S14.
