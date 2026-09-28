# R6b · The orders panel and the banner

**Lands:** the orders panel behind the army button, an army icon that shows the
orders, and the hold banner in the world. Design: README §E–F. Runs after R5.

## Read

- `src/ui/HUD.ts`: the icon-button row (grep `icon buttons`, `army`) and how
  a small glass surface is made. Read in slices.
- `src/ui/skin.ts`: the exported API list (grep `^export`), and the
  `PlateButton` / glass helpers you use.
- `src/ui/PauseMenu.ts` or `src/ui/Atlas.ts`: how an open panel guards input so
  taps don't move the hero or fire abilities.
- R5's `ArmyManager` API (`orders`, `setOrder`, `banner`, `companyCount`,
  `companyOf`, `cycleAll`) and its STATUS entry.
- `src/art/icons.ts` / `src/art/props.ts`: grep for an existing banner, flag or
  standard texture before painting one; `src/art/ink.ts` API if you paint.

## Checkpoints

**C1 · The panel.**
- The army icon button opens a small glass panel beside the icon row: one row
  per company with soldiers or a built muster building (barracks, archery
  range, outrider camp): its name, its count, three chips (Defend, Follow,
  Hold). The lit chip is the order. Hold plants the banner at the hero.
  Tapping outside or the button again closes it. It works by touch at phone
  width (375 px, portrait: it may overlay the play area while open) and with a
  mouse; `H` still cycles all companies without opening it.
- The icon reflects the orders (all defend / all follow / all hold / mixed),
  as it reflects follow/hold today; add icons only if needed, painted like the
  others.

**C2 · The banner and the check.**
- The banner: a small painted standard at `army.banner` while any company
  holds, depth-sorted like a prop, culled like other sprites.
- One browser smoke check: start, recruit a couple of soldiers (grant
  resources through the harness), open the panel, set one company to Hold and
  another to Follow, pump, and confirm the soldiers split. Up to **two**
  screenshots at `scale: 0.5`: the panel open at desktop size and at 375×812.
  Check the console.

## Acceptance

- The panel works at 375 px wide and on desktop; the orders change what
  soldiers do; the banner shows while any company holds.
- Tests, typecheck and lint green.

## Pitfalls

- The HUD is painted, not drawn: use cached skin textures.
- R6 (edge chevrons, dawn card) touches `GameScene` edge markers and the HUD's
  top centre; stay in the top-right icon row and your panel.
