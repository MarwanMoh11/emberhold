# 07 · Save v2

The live game before the frontier saved `emberhold.save.v1`: a `SaveBlob` with `v: 1`. The frontier saves `SaveBlobV2` with `v: 2` (S19), checked by `validShape` and `tolerate` in `src/systems/SaveManager.ts`. It also has a backup slot and a portable JSON download.

A v1 world can't be loaded into v2. Every position, pad, zone and camp id is different.

## Keys

| Key | Owner | Rule |
|---|---|---|
| `emberhold.save.v2` | the game (live slot) | written from S04 on |
| `emberhold.save.backup.v2` | the game (backup slot) | written from S04 on |
| `emberhold.save.v1`, `emberhold.save.backup.v1` | legacy | **never read, written or deleted** by v2 code (v1 was let go, see Migration) |
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
| `waves` | shape unchanged (S09 needed no `approachState`: a night restarts at its warning) | S09 |
| `meta` | new: `{ version }`, the build that wrote it (`GAME_VERSION`, 'Beta 1'). Optional, so older v2 saves load | S19 |
| `campGuards` | new: fallen guards, `${campId}.boss` / `${campId}.brazier${k}` | S10 |

The whole blob, every field with its owner, is `SaveBlobV2` in `src/systems/SaveManager.ts` and the CONTRACTS save-fields table.

**The rule for adding fields.** Any session that adds persistent state does all of the following in the same commit:
1. adds the field to `SaveBlobV2`;
2. adds it to `validShape` (types and ranges) and, if it holds ids, to `tolerate`;
3. restores it in `load`;
4. adds a row to the table above and to CONTRACTS.md;
5. extends `tests/save-portability.test.mjs` with a round trip.

**Tolerance** (landed S19). Ids are the keys, so a later blueprint edit that moves a pad doesn't break a save. v2 saves must survive blueprint edits:
- unknown pad, camp, POI or waystone ids are **dropped** with a `console.warn`, not rejected;
- types and ranges are still strict, as today.

## Migration

**Decided (human, 2026-09-25): v1 is let go completely. Landed in S19.**

- There is no migration, no Veteran's charter, no charter chest and no "old frontier". Options A, B and C are closed.
- v2 never reads, migrates, writes or deletes a v1 key (`emberhold.save.v1`, `emberhold.save.backup.v1`). A v1 save left in storage stays there untouched, and every player starts the frontier fresh.
- `validShape` refuses anything but `v: 2`, so a v1 file offered to Restore is refused quietly. `tests/save-portability.test.mjs` holds this.
- The game ships as **Beta 1**: `GAME_VERSION` in `src/config/version.ts`, shown small on the title screen and written to every save as `meta.version`. `v` stays the schema (2); `meta.version` names the build.

## Limits

- Whole save ≤ 64 KB.
- Fog string ≤ `maxEncodedLength`. For 160 × 144 cells as a base64 bitset, that is about 3.9k characters.
- Every array ≤ its blueprint count (pads ≤ `PADS.length` + wall pads, and so on): `tolerate` keeps each id once and only ids the world has.
- Enforced on read and write (S19). A file or slot over 64 KB is refused. `save()` writes a compact form: places as whole pixels, hp as whole points, and no field whose loader defaults it (empty progress, zero peak, nothing carried, not sheltered, a worker's carry type). Every pad built, 343 workers, 150 soldiers and full fog is about 56 KB. Past the limit, workers and soldiers drop their places (they walk out from home, as older saves did) before a save is refused.
