# S03 · Fog and culling

**Goal.**
- Size fog from the world rather than from constants.
- Make its save encoding compact enough for a world ten times the size.
- Cull off-screen static sprites.

Everything is still on the old map.

**Depends on.** S02.

**Size.** Medium.

## Read first
- [04-systems.md §Fog and culling](../design/04-systems.md#fog-and-culling-s03)
- [07-save.md §Limits](../design/07-save.md#limits)
- [CONTRACTS.md §S03](../CONTRACTS.md#s03-fog-and-culling)
- `src/core/FogMemory.ts` (small; read it whole) and `tests/fog-memory.test.mjs`.
- `src/systems/ZoneManager.ts` lines 100–150 (`revealArea`, `fogJSON`, `loadFog`).
- Wherever the fog RenderTexture and `FOG_SCALE` are created: `grep -rn "FOG_SCALE\|RenderTexture\|buildVellumTexture" src`.
- The `exploredFog` check in `validSave`: `grep -n "exploredFog" src/systems/SaveManager.ts`.
- Where node, building and prop sprites are created: `grep -n "add.image\|add.sprite" src/systems/NodeManager.ts src/entities/Building.ts src/world/Terrain.ts`.

## Do

**C1 · FogMemory v2**
1. Construct it as `(width, height, cell = 64)`.
2. Give it a compact `toJSON()`: a base64 bitset, or a run-length encoding if that is smaller for typical saves. Measure both with a synthetic 30%-explored map.
3. Add the static `maxEncodedLength`.
4. `fromJSON` must still **accept the old format** as long as the old map is live (for the test fixtures). Drop that in S19.
5. Update validation to use `maxEncodedLength`, and extend `fog-memory.test.mjs` for 10240 × 9216.

**C2 · Fog scale**
1. Change `FOG_SCALE` from 4 to 8, with the fog RenderTexture sized from `WORLD`.
2. Check the reveal edge still looks soft; raise the blur or the brush radius if it doesn't.

**C3 · Culler**
1. Add `src/systems/Culler.ts` per CONTRACTS.
2. Register node sprites, building sprites (and their labels and pad markers) and terrain props. Update it from `GameScene.update`.
3. Make sure nothing in game logic reads `.visible` of a culled object: `grep -rn "\.visible" src/systems src/entities`.
4. Add a visible-count readout to the F2 panel.

## Out of scope
- Minimap changes.
- The new world.

## Done when
- The fog test passes for both the old and the new world sizes.
- A save round-trips, both through the tests and through `H.start()`, a save, a reload and a load in the browser.
- On the old map, the F2 panel's visible static objects fall when you zoom or pan into a corner, and nothing pops in visibly at the screen edge.
- Tests and typecheck are green.

## Verify
- Browser: back up the save (see the memory note). Then check with the harness that the reveal, save and reload work.
- Take two screenshots: the fog edge, and a pan to a corner with the debug counts showing.

## Handoff
- Note the fog encoding you chose, and its measured size for a fully explored 10240 × 9216 map.
- Add an `exploredFog` row to the save-fields table in CONTRACTS.
