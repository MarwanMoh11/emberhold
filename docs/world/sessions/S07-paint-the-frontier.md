# S07 · Paint the frontier

**Goal.** Replace S04's flat paint with real terrain art in the game's ink style:
- 17 biomes with soft borders;
- coast and surf;
- a river with banks and flow;
- the lake and its isle;
- cliff faces;
- lava and the caldera;
- every crossing drawn as what it is;
- roads;
- ground decals.

Plus scatter props (not nodes) so the regions read at a glance.

**Depends on.** S02 (the painter contract) and S04 (the flat painter to replace).

**Size.** Large, and mostly writing. Reading is light: see below. This card may use **6** screenshots instead of 4.

## Read first
- [01-world.md §Geography](../design/01-world.md#geography-north-to-south) and the region table.
- [04-systems.md §Chunked terrain](../design/04-systems.md#chunked-terrain-s02)
- The painter notes from STATUS (S02 and S04).
- `src/art/ink.ts`: **exports only** (`grep -n "^export"`). Then read the two or three helpers you will use.
- **Don't** read `art/buildings.ts` or `art/units.ts`.
- For per-region content, use `render.mjs --region <id>`, not the blueprint.

## Do

**C1 · Ground**
1. Give each biome a palette and texture recipe: base, two noise-modulated tints, and a sparse decal set. Examples: flowers on meadow, cracked earth on badlands, ash drifts on ash, rust streaks on rust, sulphur crust on sulphur, frost on highland.
2. Soften region borders by blending the two biomes across about 96 px. Use the raster's region index at the neighbouring cells.

**C2 · Features**
1. Coast: a sand band and animated-free foam dashes.
2. River:
   - darker deep water, a lighter shelf near the banks;
   - a bank edge line;
   - flow streaks along the segment direction.
3. The lake with its isle shore.
4. Cliffs: a rock face with the shadow on the downhill side (use the segment normal), and a crest highlight.
5. Lava: an orange core, a dark crust and a glow halo. The caldera gets the same treatment, plus the island.

**C3 · Crossings and roads**
1. Draw each crossing kind:
   - **bridge:** stone deck, parapets and piers;
   - **ford:** stepping stones and a lighter shallow;
   - **pass:** a cut through the cliff with rubble;
   - **stair:** switchback steps;
   - **causeway:** a stone path over water or lava;
   - **obsidian:** glassy black.
2. Roads: trodden earth at their width, edges broken by noise, cart ruts on the King's Road.

**C4 · Scatter**
1. Place static prop sprites per biome, away from pads (100 px or more), node fields, roads and crossings:
   - pines in highland;
   - reeds in marsh;
   - dead trees in moor;
   - bones and standards in ash;
   - fence lines in farmland.
2. Use a deterministic scatter per chunk, registered with the Culler.
3. Budget: 1500 props or fewer world-wide.

## Out of scope
- Landmarks, which are POIs (S14).
- The sealed causeway's fire (S10).
- The claim tint (S08).

## Done when
- The bake time per chunk stays ≤ 12 ms. Log the maximum over a full pan of the world.
- No seams are visible.
- Every crossing is recognisable at 1× zoom.
- Tests and typecheck are green.

## Verify
- Take 6 screenshots at `scale: 0.5`:
  1. the hold and the Old Bridge;
  2. Millford;
  3. the Gorge Bridge;
  4. Frostmere and the isle;
  5. the Scar with the Cinder Stair;
  6. the caldera.
- Pan with `H.tp`.
- Report the maximum bake time.

## Handoff
- Where each feature's painter lives.
- The per-chunk bake cost.
- The prop count.
- Anything S14's landmarks should match.
