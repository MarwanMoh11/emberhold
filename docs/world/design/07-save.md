# 07 · Save v2

Today's save is `emberhold.save.v1`: a `SaveBlob` with `v: 1`, validated strictly by `validSave` in `src/systems/SaveManager.ts`. It also has a backup slot and a portable JSON download.

A v1 world can't be loaded into v2. Every position, pad, zone and camp id is different.

## Keys

| Key | Owner | Rule |
|---|---|---|
| `emberhold.save.v2` | the game (live slot) | written from S04 on |
| `emberhold.save.backup.v2` | the game (backup slot) | written from S04 on |
| `emberhold.save.v1` | legacy | **never written or deleted** by v2 code. The migration decision below says what v2 does with it |
| `emberhold.settings.v1` | settings | unchanged; world-agnostic |

## Schema

The v1 fields, with these changes:

| Field | Change | Added by |
|---|---|---|
| `v` | `2` | S04 |
| `zones` | renamed `regions`: claimed `RegionId[]` | S04 (rename), S08 |
| `exploredFog` | new encoding. Length ≤ `FogMemory.maxEncodedLength(WORLD)` | S03 |
| `camps` | still the burned ids. Adds `campAwake: string[]` | S08 |
| `campHealth` | also holds boss health, keyed by boss key | S17 |
| `buildings` | unchanged shape. Wall-line pads use ids `${line}.${k}` | S10 |
| `waystones` | active ids | S11 |
| `pois` | `done` ids (shrines, caches, lore, barrows, survivors) | S14 |
| `relics` | held ids | S15 |
| `waves` | adds `approachState` if S09 needs it | S09 |

**The rule for adding fields.** Any session that adds persistent state does all of the following in the same commit:
1. adds the field to `SaveBlob`;
2. adds it to `validSave`;
3. restores it in `load`;
4. adds a row to the table above and to CONTRACTS.md;
5. extends `tests/save-portability.test.mjs` with a round trip.

**Tolerance.** Ids are the keys, so a later blueprint edit that moves a pad doesn't break a save. v2 saves must survive blueprint edits:
- unknown pad, camp, POI or waystone ids are **dropped** with a `console.warn`, not rejected;
- types and ranges are still strict, as today.

## Migration

**Open decision for the human.** S19 implements it; until then the default holds.

Until S19, S04's guard applies: a v1 save present with no v2 save means the game starts a fresh v2 run. The v1 save is left untouched.

**A · The Veteran's charter (recommended default).**
- **When it appears.** On the title screen, when a v1 save exists and no v2 save does. The screen offers "The frontier has changed. Take up the charter".
- **What carries over:**
  - hero level, capped at 10, and its XP;
  - ability and upgrade ranks (`upgrades`, `abilities`);
  - lifetime kills and boss kills;
  - achievements and deeds (these already live outside the world).
- **What starts fresh:** the world itself. The hall is at level 1.
- **The charter chest.** A chest at the hall holds 25% of the v1 stockpile, with coins capped at 1500 and each other resource at 600.
- **The v1 save** is copied to `emberhold.save.v1.archive` and left in place.

**B · Clean slate.**
- v1 is ignored (and kept in storage). v2 starts fresh.
- One line on the title: "The frontier has changed. Old saves are kept but cannot be continued."
- Cheapest option.

**C · Keep v1 playable.**
- Ship both worlds, with an "Old frontier" menu entry.
- This means maintaining two configs, the old `map.ts` and the v1 terrain painter, forever. **Not recommended.**

## Limits

- Whole save ≤ 64 KB.
- Fog string ≤ `maxEncodedLength`. For 160 × 144 cells as a base64 bitset, that is about 3.9k characters.
- Every array ≤ its blueprint count (pads ≤ `PADS.length` + wall pads, and so on).
