# Emberhold

**▶ Play: <https://marwanmoh11.github.io/emberhold/>** — desktop or phone, no install.

A browser game about rebuilding a burned frontier outpost: kill things, carry the
loot home on your back, raise camps, hire a crew, recruit an army, and hold the
settlement through the night.

Horde survival on top of a tycoon loop. Everything — art, sound, terrain — is
generated in code at boot. There are no asset files in this repository.

```bash
npm install
npm run dev
```

Then open <http://localhost:5180>.

## Playing

| | |
|---|---|
| Move | `WASD` / arrows, or drag the left half of the screen |
| Attack | automatic — you swing at whatever is in range |
| Dodge | `X`, or the dodge button above the ability bar |
| Build / upgrade | walk into a build site; hold `SHIFT` to fund an upgrade |
| Hire, recruit | stand on the camp or barracks |
| Abilities | `SPACE`, `Q`, `E`, `F`, `G`, ultimate on `R` |
| Army follow / hold | `H`, or the stance button under the health bar |
| Minimap | `M`, or the MAP chip under the stance button |
| Pause | `ESC` or `P`, or PAUSE under the health bar |
| Debug panel | `F2` |

A standard controller also works: left stick or D-pad moves, A/B/X/Y/LB use
the five abilities, RB dodges, RT fires the ultimate, Start pauses, Back toggles
the map, and left stick click changes the army order. Use the D-pad and A to
navigate the pause menu; A/B/X choose level-up cards.

On a phone it plays in either orientation: drag the left half of the screen to
move, tap the buttons bottom-right for abilities and dodge, tap PAUSE or the army's
standing order under the health bar, and everything else happens by walking
into it. The minimap starts folded away on a phone, because the corners are
full; tap MAP to unfold it. Add it to your home screen and it opens without
browser chrome. The horde is capped lower on a phone so the frame rate holds.

The loop: sweep up coins and wood by hand → walk the load to the depot or a
build site → raise a camp → the crew there works on its own → spend the income
on soldiers, towers and walls → survive the night → claim the next territory.

The 21-objective campaign culminates at Ashgate Fortress. Destroying it wakes
the Cinder Regent, whose ground warnings mark the fire attacks before they
land. The final fight's remaining health is saved, and endless nights continue
after the campaign victory.

Two rules do most of the work:

- **Resources are physical.** Kills drop loot, loot is carried on your back up
  to your pack limit, and it only counts once you physically deliver it.
- **Standing somewhere is the interaction.** There is no build menu. Stand in a
  site and it draws what it needs out of your pack; stand in a camp and it hires.

Progress saves to `localStorage` every 10 seconds, when you pause, and when the
page is hidden. The previous valid save is kept as a fallback. Use **EXPORT FILE**
in the pause menu to download a portable JSON save, then **RESTORE FILE** on the
title screen to bring it back in another browser or device. Restoring checks the
file and asks for a second press before replacing the current settlement. An interrupted
night restarts from its warning after loading, so it cannot be skipped. A Hall
loss instead gives a full day to rebuild before that same wave returns. The
pause menu has a reset button; starting a new game also asks for a second press.
Troops and workers keep their positions, injuries and carried goods; damaged
enemy camps and the Cinder Regent keep their remaining health. A saved
settlement loss reopens its recovery screen. Explored ground stays visible in
both the world and minimap, and the daytime countdown survives a reload. After
the campaign, repeatable mastery choices
keep level-ups meaningful through endless nights.

When the hero falls, a countdown shows the three-second return to the Hall.
The returning hero has a brief shield to escape enemies gathered at the spawn.

## Automation

The settlement is meant to keep earning while you are busy elsewhere, so the
resource counters never stall:

- **Stores are uncapped.** A shared cap meant a flood of food could freeze the
  wood counter while lumberjacks kept chopping.
- **Crews shelter instead of stopping.** When the horde is on a camp the workers
  duck inside — untargetable, and still producing at 45%.
- **Lost crew is replaced automatically.** A Warehouse additionally automates
  hiring into brand-new slots.
- **A razed site leaves rubble.** Rebuilding costs 40% of the original, and the
  crew comes back with it.
- **Time away pays.** Offline income tapers toward a one-hour ceiling, so a week
  away and a night away are worth about the same.

One deliberate exception: **upgrading an existing building never spends on its
own.** Walk into an empty site and it builds itself out of your stores, but
raising a level costs a press of UPGRADE. Standing still used to quietly drain
every coin you owned into whatever you happened to be next to.

## Architecture

```
src/
  config/     all balance and content data — nothing here is code you run
  core/       Grid (spatial hash), Pool, events, math, ids
  entities/   plain data objects: Player, Enemy, Worker, Soldier, Building
  systems/    one manager per concern, each with update(dt)
  art/        procedural texture generation, baked once at boot
  world/      the terrain bake
  ui/         HUD, panels, overlays
  scenes/     Boot (bakes art, title), Game (world), UI (fixed HUD)
  dev/        scripted-play harness, dev builds only
```

Balance lives in `src/config/`. No gameplay file hard-codes a tuning number:
`balance.ts` holds the global constants, and the rest of `config/` describes
buildings, units, enemies, waves, quests, upgrades, abilities and the map.

### Performance notes

The target is a few hundred enemies at 60 fps, and the design follows from that.

- **No physics engine.** Enemies are plain objects with one `Image` each, moved
  by hand. Arcade Physics bodies for hundreds of units cost more than the AI does.
- **Spatial hashes by entity type.** `core/Grid.ts` backs the enemy, ally and
  structure queries for targeting, separation, splash and tower range.
- **Staggered AI.** Retarget timers are offset per entity id, and separation
  looks at a fixed handful of neighbours rather than all of them.
- **Pools** for enemies, projectiles, pickups and floating text.
- **The minimap redraws selectively.** Territory, structures and fog bake into a
  RenderTexture at most four times a second and only when something changed;
  the hero, camera box and enemy density are rebuilt at 9 Hz out of flat
  rectangles. Rounded rectangles and circles are paths Phaser re-triangulates
  every frame, and four of them cost more than the rest of the widget together.
- **The terrain is one draw call** — baked into a half-resolution RenderTexture
  at startup. Fog of war is a quarter-resolution texture that gets erased.

The F2 panel reports rolling 95th-percentile simulation and frame times. In
the in-app preview, roughly 250 active enemies took **2.6 ms** for the game
update, while both an idle scene and the horde ran near **33 ms per frame**.
That preview appears to be capped near 30 fps; use a release build on target
hardware to establish the actual rendering limit.

## Deployment

`.github/workflows/deploy.yml` builds on every push to `main` and publishes
`dist/` to GitHub Pages. Pages serves a project site from `/emberhold/`, which
is why `vite.config.ts` sets `base` for production builds only.

## Development

```bash
npm run typecheck   # tsc --noEmit, strict
npm test            # recovery, wave retry and combat regression tests
npm run build       # typecheck, then a production bundle
npm run preview     # serve the built bundle
```

In a dev build, `window.H` is a scripted-play harness that pumps the game loop
off a synthetic clock, so a whole day/night cycle runs in a fraction of a second:

```js
H.start()            // skip the title
H.build('lumber1')   // walk there and fund it
H.pump(120)          // 120 game-seconds, as fast as the CPU allows
H.snap('two nights') // resources, crew, wave, buildings
```

## Originality

Every asset is generated by the code in `src/art/` — shapes drawn into textures
at boot — and every sound is synthesised through WebAudio oscillators and noise
buffers. The name, world, buildings, units and progression are original to this
project.
