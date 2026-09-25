import type Phaser from 'phaser'
import { REGIONS, WALL_LINES, WORLD } from '../config/world'
import { DPR } from '../core/device'

/**
 * Dev-only scripted-play harness, stripped from production builds.
 *
 * The browser throttles requestAnimationFrame hard when the tab is not the
 * foreground window, which makes a real-time playthrough useless for checking
 * balance. So this pumps `game.loop.step()` by hand off a synthetic clock and
 * lets a whole day/night cycle run in a fraction of a second.
 *
 * Open the console and try:
 *   H.start(); H.build('lumber1'); H.pump(60); H.snap('one night')
 *
 * World v2 helpers:
 *   H.tp(5120, 4230)     teleport the hero (camera and terrain follow at once)
 *   H.claim('downs')     claim a region without paying (regions.claim(id, true))
 *   H.burn('campFerrow') burn a camp outright (the approaches muster at the next one)
 *   H.night(5)           jump to night 5's warning: tonight's approaches, spawn points, musters
 *   H.march(30)          pump the night: per-approach arrivals, enemies off the ground, road share, speeds
 *   H.reveal()           clear the fog everywhere
 *   H.where()            { x, y, region } of the hero
 *   H.world()            counts: size, regions claimed, pads, camps, nodes, enemies, chunks
 *   H.nav()              NavGrid version and rebuild timings; walkers standing off the ground
 *   H.watch(120)         pump while watching allies: deliveries, off-ground frames, soldiers stuck, path cost
 *   H.run(0, 1, 3)       hold a move direction for 3 s: the hero's speed and time on a road
 *   H.buildLine('palisade', 3)  raise (or drop) every piece and gate of a wall line to a level
 *   H.wallGaps('palisade')      walk the line every 4 px: cells the horde could path through, points a body slips past
 *   H.assault('grunt', 5120, 2300, 40)  send one walker at the ring: what it hit, whether it got in unbroken
 *   H.panel()            the docked sheet: rect, share of the viewport, overlap with the building and hero, targets, smallest font
 *   H.tap(x, y, holdS)   press the canvas at a CSS-pixel point (a real DOM mouse event), hold for holdS s of game time
 *   H.atlas(open?)       the atlas (S12): open or close it; view, explored regions, stones on screen, open ms, bake stats
 *   H.mini()             the minimap (S12): panel rect, window radius, marks draw ms
 *   H.lvl('cottage1', 2) set a pad's level through the loader (S13b)
 *   H.cottages('greyfall', 12)  twelve dev cottages by the hero in Greyfall's style: tones, yard layouts, textures
 *   H.looks()            regional looks (S13b C4): bld_ textures against the cap, bakes and their ms
 */
export function installHarness(game: Phaser.Game) {
  // Keep the fake clock well ahead of the real one: Phaser clamps a step whose
  // timestamp is behind the previous frame, which silently yields dt === 0.
  let t = performance.now() + 5_000_000

  const gs = () => game.scene.getScene('Game') as any
  const ui = () => game.scene.getScene('UI') as any

  /** Answer any modal that would otherwise block a scripted run. */
  const auto = () => {
    const u = ui()
    if (u?.levelUp?.open) u.levelUp.choose(0)
  }

  const pump = (seconds: number, stepMs = 33) => {
    const n = Math.max(1, Math.round((seconds * 1000) / stepMs))
    for (let i = 0; i < n; i++) { t += stepMs; game.loop.step(t); auto() }
  }

  const start = (load = false) => {
    const boot = game.scene.getScene('Boot') as any
    boot.scene.start('Game', { load, settings: boot.settings })
    pump(0.6)
    return 'game started'
  }

  const goTo = (x: number, y: number, maxSeconds = 10) => {
    const g = gs(); const p = g.player
    const stepMs = 33
    for (let i = 0; i < Math.round((maxSeconds * 1000) / stepMs); i++) {
      const dx = x - p.x, dy = y - p.y
      const d = Math.hypot(dx, dy) || 1
      if (d < 16) break
      g.moveInput.x = dx / d; g.moveInput.y = dy / d
      t += stepMs; game.loop.step(t); auto()
    }
    g.moveInput.x = 0; g.moveInput.y = 0
    return [Math.round(p.x), Math.round(p.y)]
  }

  const pad = (id: string) => gs().buildings.byPad.get(id)

  const build = (id: string, dwellSeconds = 6) => {
    const b = pad(id)
    if (!b) return `no pad "${id}"`
    goTo(b.x, b.y + 30, 12)
    pump(dwellSeconds)
    return `${id}:${b.level}`
  }

  const snap = (tag = '') => {
    const g = gs()
    const r = (k: string) => +(g.res.rate[k] || 0).toFixed(2)
    return {
      tag,
      stored: { ...g.res.stored },
      rate: { coins: r('coins'), wood: r('wood'), food: r('food') },
      workers: g.workers.count,
      workerStates: g.workers.workers.map((w: any) => w.state).join(','),
      army: g.army?.count ?? 0,
      wave: g.waves.wave,
      phase: g.waves.phase,
      enemies: g.enemies.walkerCount,
      hero: `${Math.round(g.player.hp)}/${g.player.maxHp} lv${g.levels?.level ?? 1}`,
      built: [...g.buildings.byPad.values()]
        .filter((b: any) => b.level > 0)
        .map((b: any) => `${b.padId}:${b.level}`),
    }
  }

  /**
   * Lay every texture whose key starts with one of `prefixes` out on a
   * full-window canvas, magnified. Click it to dismiss. The art is all baked
   * at boot, so this is the quickest way to look at a change to it.
   */
  const gallery = (prefixes: string[], zoom = 3, bg = '#8a9454') => {
    document.getElementById('gal')?.remove()
    const tm = game.textures
    const keys = tm.getTextureKeys().filter(k => prefixes.some(p => k.startsWith(p)))
    const c = document.createElement('canvas')
    c.id = 'gal'
    c.width = innerWidth; c.height = innerHeight
    Object.assign(c.style, { position: 'fixed', inset: '0', zIndex: '99', background: bg })
    const x = c.getContext('2d')!
    x.imageSmoothingEnabled = false
    let px = 8, py = 8, rowH = 0
    for (const k of keys) {
      const img = tm.get(k).getSourceImage() as CanvasImageSource & { width: number; height: number }
      const w = img.width * zoom, h = img.height * zoom
      if (px + w > c.width) { px = 8; py += rowH + 14; rowH = 0 }
      x.drawImage(img, px, py, w, h)
      x.fillStyle = '#000'; x.font = '10px sans-serif'; x.fillText(k, px, py + h + 10)
      px += w + 10; rowH = Math.max(rowH, h)
    }
    document.body.appendChild(c)
    c.onclick = () => c.remove()
    return keys.length
  }

  const tp = (x: number, y: number) => {
    const g = gs(); const p = g.player
    p.x = Math.max(24, Math.min(WORLD.width - 24, x))
    p.y = Math.max(24, Math.min(WORLD.height - 24, y))
    const cam = g.cameras.main
    cam.centerOn(p.x, p.y)
    g.terrain.prime(cam)
    pump(0.1)
    return where()
  }

  const claim = (id: string) => {
    const z = gs().regions
    if (!REGIONS.some(r => r.id === id)) return `no region "${id}"`
    z.claim(id, true)
    return `${id}: ${z.claimed(id) ? 'claimed' : 'unclaimed'}`
  }

  /** Burn a camp outright (asleep or awake), reward and all. */
  const burn = (id: string) => (gs().camps.burn(id) ? `${id}: burned` : `${id}: no such standing camp`)

  /**
   * Skip to the warning of night `wave` (default: the next), pump through it,
   * and report tonight's plan: approaches, spawn points, musters.
   */
  const night = (wave?: number) => {
    const g = gs(); const w = g.waves
    if (wave !== undefined) w.wave = Math.max(0, wave - 1)
    w.forceNextWave()
    pump(0.1)
    const plan = w.tonight.map((t: any) => ({
      id: t.id, spawn: [Math.round(t.x), Math.round(t.y)], muster: g.approaches.muster(t.id)?.id,
      toClaimed: Math.round(g.approaches.toClaimed(t.id).d), routeCells: t.route.length,
    }))
    return { wave: w.wave + 1, banner: w.bannerText, plan }
  }

  /**
   * Pump a night in steps, logging per-approach first arrivals (seconds after
   * dusk), enemies on impassable cells, the fastest marcher seen and where the
   * walkers are. Stops at `seconds` or the dawn.
   */
  const march = (seconds = 30, step = 0.5) => {
    const g = gs(); const w = g.waves; const n = g.nav
    let offGround = 0, onRoadFrames = 0, frames = 0, maxMarch = 0, maxWalk = 0, maxRoad = 0
    const seen = new Set<string>()
    const pos = new Map<object, [number, number, boolean]>()
    const crossings = n.r.bp.FEATURES.crossings
    for (let t = 0; t < seconds && (w.phase !== 'day' || t === 0); t += step) {
      pump(step)
      for (const e of g.enemies.list) {
        if (!e.active || !e.alive || e.def.structure) { pos.delete(e); continue }
        frames++
        if (!n.passableAt(e.x, e.y)) offGround++
        if (n.onRoad(e.x, e.y)) onRoadFrames++
        if (e.approach) {
          seen.add(`${e.approach}:${g.regions.regionAt(e.x, e.y)?.id ?? '?'}`)
          const k = n.r.crossing[n.r.cell(e.x, e.y)]
          if (k >= 0) seen.add(`${e.approach}@${crossings[k].id}`)
        }
        const last = pos.get(e)
        const steady = !e.kx && !e.ky && e.auraSpeed === 1 && !(e.slowT > 0)
        if (last && last[2] === e.marching && steady) {
          const v = Math.hypot(e.x - last[0], e.y - last[1]) / step / (e.def.speed || 1)
          if (e.marching) maxMarch = Math.max(maxMarch, v)
          else {
            maxWalk = Math.max(maxWalk, v)
            if (n.onRoad(e.x, e.y) && n.onRoad(last[0], last[1])) maxRoad = Math.max(maxRoad, v)
          }
        }
        pos.set(e, [e.x, e.y, e.marching])
      }
    }
    return {
      phase: w.phase, nightElapsed: +w.nightElapsed.toFixed(1), fighting: w.fighting, arrivals: { ...w.arrivals },
      walkers: g.enemies.walkerCount, marching: g.enemies.list.filter((e: any) => e.active && e.alive && e.marching).length,
      offGround, onRoadShare: frames ? +(onRoadFrames / frames).toFixed(2) : 0,
      speedOverBase: { marching: +maxMarch.toFixed(2), walking: +maxWalk.toFixed(2), walkingOnRoad: +maxRoad.toFixed(2) },
      seen: [...seen].sort(),
    }
  }

  /** A wall line's pieces and gates, as built in the game. */
  const linePads = (lineId: string) => {
    const line = WALL_LINES.find(l => l.id === lineId)
    if (!line) return null
    const bs = [...gs().buildings.byPad.values()] as any[]
    return { line, pads: bs.filter(b => b.padId.startsWith(`${lineId}.`) || line.gates.some(q => q.id === b.padId)) }
  }

  /** Raise (or drop) every piece and gate of a wall line to `lvl`, through the save loader. */
  const buildLine = (lineId = 'palisade', lvl = 1) => {
    const lp = linePads(lineId)
    if (!lp) return `no line "${lineId}"`
    gs().buildings.load(lp.pads.map(b => ({ padId: b.padId, level: lvl, hp: 1e9, progress: {}, peakWorkers: 0 })))
    pump(0.1)
    return `${lineId}: ${lp.pads.length} pads at ${lvl}`
  }

  /**
   * Walk a wall line every 4 px. A nav leak is a point whose cell is ground,
   * not walled and not under a standing gate; a body leak is a point where no
   * standing wall or gate box stops the smallest walker (radius 8).
   */
  const wallGaps = (lineId = 'palisade') => {
    const lp = linePads(lineId)
    if (!lp) return `no line "${lineId}"`
    const g = gs(); const n = g.nav
    const gates = lp.pads.filter(b => b.key === 'gate' && b.level > 0 && b.alive)
    const underGate = (i: number) => {
      const [cx, cy] = n.r.xy(i)
      return gates.some(q => {
        const dx = cx - q.x, dy = cy - q.y, ux = q.piece?.ux ?? 1, uy = q.piece?.uy ?? 0
        return Math.abs(dx * ux + dy * uy) <= 32 && Math.abs(-dx * uy + dy * ux) <= 24
      })
    }
    const pts = lp.line.ring ? [...lp.line.pts, lp.line.pts[0]] : lp.line.pts
    const navLeaks: number[][] = [], bodyLeaks: number[][] = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
      const k = Math.ceil(Math.hypot(bx - ax, by - ay) / 4)
      for (let j = 0; j <= k; j++) {
        const x = ax + ((bx - ax) * j) / k, y = ay + ((by - ay) * j) / k
        const c = n.r.cell(x, y)
        if (!n.passable(c)) continue
        if (!n.blocked(c) && !underGate(c)) navLeaks.push([Math.round(x), Math.round(y)])
        if (!g.buildings.blockerAt(x, y, 8)) bodyLeaks.push([Math.round(x), Math.round(y)])
      }
    }
    return {
      pieces: lp.pads.length, built: lp.pads.filter(b => b.level > 0 && b.alive).length,
      navLeaks: navLeaks.slice(0, 24), bodyLeaks: bodyLeaks.slice(0, 24),
      ...(navLeaks.length > 24 || bodyLeaks.length > 24 ? { counts: [navLeaks.length, bodyLeaks.length] } : {}),
    }
  }

  /**
   * Send one walker at a wall line from (x, y) and pump: which pads it struck,
   * and whether it ever stood inside the line's bounding box while every
   * piece and gate still stood.
   */
  const assault = (key = 'grunt', x = 5120, y = 2300, seconds = 40, lineId = 'palisade') => {
    const lp = linePads(lineId)
    if (!lp) return `no line "${lineId}"`
    const g = gs()
    const e = g.enemies.spawn(key, x, y)
    if (!e) return `could not spawn ${key}`
    const xs = lp.line.pts.map(p => p[0]), ys = lp.line.pts.map(p => p[1])
    const box = [Math.min(...xs) + 24, Math.min(...ys) + 24, Math.max(...xs) - 24, Math.max(...ys) - 24]
    const hp0 = new Map(lp.pads.map(b => [b.padId, b.hp]))
    const struck: Record<string, number> = {}
    let insideUnbroken = false, inside = false, firstBroken: string | null = null, t = 0
    for (; t < seconds && e.alive && e.active; t += 0.25) {
      pump(0.25)
      for (const b of lp.pads) {
        if (b.hp < (hp0.get(b.padId) ?? 0)) struck[b.padId] = Math.round((hp0.get(b.padId) ?? 0) - b.hp)
        if (!firstBroken && (!b.alive || b.level === 0) && (hp0.get(b.padId) ?? 0) > 0) firstBroken = b.padId
      }
      const inBox = e.x > box[0] && e.x < box[2] && e.y > box[1] && e.y < box[3]
      if (inBox) { inside = true; if (!firstBroken) insideUnbroken = true }
    }
    const out = { key, t, alive: e.alive, at: [Math.round(e.x), Math.round(e.y)], target: e.target?.padId ?? e.target?.kind ?? null,
      struck, firstBroken, inside, insideUnbroken }
    if (e.active) g.enemies.despawn(e)
    return out
  }

  /** A camp at a glance (S10): state, tier, hp, wards, patrols and how far they have strayed. */
  const camp = (id: string) => {
    const g = gs()
    const rec = g.camps.camps.find((c: any) => c.spec.id === id)
    if (!rec) return `no camp "${id}"`
    const far = (e: any) => Math.round(Math.hypot(e.x - rec.spec.x, e.y - rec.spec.y))
    return {
      id, state: rec.state, tier: rec.spec.tier, hp: rec.enemy ? Math.round(rec.enemy.hp) : null,
      shielded: !!rec.enemy?.shielded, guardsUp: g.camps.guardsUp(id),
      guards: rec.guards.filter((e: any) => e?.active && e.alive).map((e: any) => ({ key: e.key, name: e.def.name, hp: Math.round(e.hp), d: far(e) })),
      patrols: rec.patrols.length, patrolFar: Math.max(0, ...rec.patrols.map(far)),
    }
  }

  /**
   * The leash: wake a camp, stand by it until its patrols engage, then walk
   * off `away` px and pump. The farthest any patrol got from its camp, then
   * and at the end.
   */
  const leash = (id: string, seconds = 20, away = 1600) => {
    const g = gs()
    const rec = g.camps.camps.find((c: any) => c.spec.id === id)
    if (!rec) return `no camp "${id}"`
    g.camps.wake(id)
    const heal = () => { g.player.hp = g.player.maxHp }
    tp(rec.spec.x + 150, rec.spec.y + 220)
    for (let t = 0; t < Math.max(8, rec.spec.spawns.every + 2); t += 0.5) { heal(); pump(0.5) }
    const engaged = rec.patrols.filter((e: any) => e.target === g.player).length
    tp(rec.spec.x + away, rec.spec.y + 200)
    let worst = 0
    for (let t = 0; t < seconds; t += 0.5) {
      heal(); pump(0.5)
      for (const e of rec.patrols) worst = Math.max(worst, Math.hypot(e.x - rec.spec.x, e.y - rec.spec.y))
    }
    return { patrols: rec.patrols.length, cap: 2 * rec.spec.spawns.count, engaged, worstAfterLeaving: Math.round(worst), ...camp(id) as object }
  }

  /**
   * The siege radius: put a `key` pad `d` px from a camp (a dev override: no
   * blueprint pad sits that close), build it, wake the camp, and pump.
   */
  const siege = (id: string, key = 'farm', d = 420, seconds = 30) => {
    const g = gs()
    const rec = g.camps.camps.find((c: any) => c.spec.id === id)
    if (!rec) return `no camp "${id}"`
    const padId = `siegeTest.${id}`
    let b = g.buildings.byPad.get(padId)
    if (!b) {
      // the first of eight bearings on open ground the camp can see
      let at = [rec.spec.x, rec.spec.y + d]
      for (let k = 0; k < 8; k++) {
        const a = Math.PI / 2 + (k * Math.PI) / 4, x = rec.spec.x + Math.cos(a) * d, y = rec.spec.y + Math.sin(a) * d
        if (g.nav.passableAt(x, y) && g.nav.lineClear(rec.spec.x, rec.spec.y, x, y)) { at = [x, y]; break }
      }
      b = g.buildings.addPad({ id: padId, key, x: at[0], y: at[1], region: rec.spec.region })
    }
    g.buildings.load([{ padId, level: 1, hp: 1e9, progress: {}, peakWorkers: 0 }])
    g.camps.wake(id)
    tp(rec.spec.x + 2000, rec.spec.y)
    const hp0 = b.hp
    pump(seconds)
    return { pad: padId, at: [Math.round(b.x), Math.round(b.y)], hp0: Math.round(hp0), hp: Math.round(b.hp), alive: b.alive,
      attackers: rec.patrols.filter((e: any) => e.target === b).length, patrols: rec.patrols.length }
  }

  const reveal = () => { gs().regions.revealAll(); return 'fog cleared' }

  const where = () => {
    const g = gs(); const p = g.player
    return { x: Math.round(p.x), y: Math.round(p.y), region: g.regions.regionAt(p.x, p.y)?.id ?? null }
  }

  const world = () => {
    const g = gs()
    const pads = [...g.buildings.byPad.values()]
    return {
      size: `${WORLD.width}x${WORLD.height}`,
      regions: REGIONS.length,
      claimed: REGIONS.filter(r => g.regions.claimed(r.id)).map(r => r.id),
      pads: pads.length,
      built: pads.filter((b: any) => b.level > 0).length,
      camps: g.camps.camps.length,
      campsLive: g.camps.camps.filter((c: any) => !c.destroyed).length,
      campsAwake: g.camps.camps.filter((c: any) => c.state === 'awake').map((c: any) => c.spec.id),
      nodes: g.nodes.nodes.length,
      enemies: g.enemies.walkerCount,
      wave: g.waves.wave,
      phase: g.waves.phase,
      chunks: g.terrain.stats(),
      cull: g.culler.stats(),
    }
  }

  /** NavGrid state, and the walkers (enemies, troops, workers, hero) standing on impassable ground right now. */
  const nav = () => {
    const g = gs(); const n = g.nav
    const off = (list: any[]) => list.filter(u => u.active !== false && u.alive && !n.passableAt(u.x, u.y)).length
    return {
      ...n.stats(),
      offGround: {
        enemies: off(g.enemies.list),
        soldiers: off(g.army.soldiers ?? []),
        workers: off(g.workers.workers ?? []),
        hero: n.passableAt(g.player.x, g.player.y) ? 0 : 1,
      },
    }
  }

  /**
   * Pump `seconds` while watching the allies (S06): drop-offs made, frames a
   * worker or soldier stood on impassable ground, frames a worker was on a
   * crossing, and the longest a soldier more than 160 px from the hero (or
   * the hall when holding) went moving under 10 px per half second.
   */
  const watch = (seconds: number, stepMs = 33) => {
    const g = gs(); const n = g.nav; const r = n.r
    const d0 = g.workers.delivered
    let badWorker = 0, badSoldier = 0, workerOnCrossing = 0, worstStuck = 0
    const last = new Map<number, { x: number; y: number; t: number }>()
    const steps = Math.round((seconds * 1000) / stepMs)
    for (let k = 0; k < steps; k++) {
      t += stepMs; game.loop.step(t); auto()
      for (const w of g.workers.workers) {
        if (!w.alive || w.sheltered) continue
        if (!n.passableAt(w.x, w.y)) badWorker++
        if (r.crossing[r.cell(w.x, w.y)] >= 0) workerOnCrossing++
      }
      const ax = g.army.holding ? g.buildings.townHall.x : g.player.x
      const ay = g.army.holding ? g.buildings.townHall.y + 60 : g.player.y
      const sample = k % Math.max(1, Math.round(500 / stepMs)) === 0
      for (const s of g.army.soldiers) {
        if (!s.alive) continue
        if (!n.passableAt(s.x, s.y)) badSoldier++
        if (!sample) continue
        const l = last.get(s.id) ?? { x: s.x, y: s.y, t: 0 }
        const far = Math.hypot(ax - s.x, ay - s.y) > 160
        l.t = far && Math.hypot(s.x - l.x, s.y - l.y) < 10 ? l.t + 0.5 : 0
        l.x = s.x; l.y = s.y
        last.set(s.id, l)
        worstStuck = Math.max(worstStuck, l.t)
      }
    }
    return {
      seconds, deliveries: g.workers.delivered - d0, badWorker, badSoldier, workerOnCrossing, worstStuck,
      paths: n.paths.stats(),
    }
  }

  /** Hold a move direction for `seconds`: the hero's average speed, and the share of it spent on a road. */
  const run = (dx: number, dy: number, seconds: number, stepMs = 33) => {
    const g = gs(); const p = g.player
    const x0 = p.x, y0 = p.y
    let road = 0
    const steps = Math.round((seconds * 1000) / stepMs)
    for (let k = 0; k < steps; k++) {
      g.moveInput.x = dx; g.moveInput.y = dy
      t += stepMs; game.loop.step(t); auto()
      if (g.nav.onRoad(p.x, p.y)) road++
    }
    g.moveInput.x = 0; g.moveInput.y = 0
    return { pxPerSec: Math.round(Math.hypot(p.x - x0, p.y - y0) / seconds), onRoad: +(road / steps).toFixed(2), at: where() }
  }

  type R = { x: number; y: number; w: number; h: number }
  const hits = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  const round = (r: R) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })

  /**
   * The docked sheet (the build card, or a border stone's card), in CSS px:
   * its rect and share of the viewport's area, whether it covers the building
   * (or stone) and the hero on screen, every tap target and the smallest font.
   */
  const panel = () => {
    const g = gs()
    let info = g.buildings.panel.inspect()
    let about: any = g.buildings.activePanelFor
    let img: any = about?.sprite
    if (!info) {
      info = g.regions.inspectDock()
      if (!info) return null
      const p = g.player
      let best = Infinity
      for (const v of g.regions.views.values()) {
        const d = Math.hypot(v.cx - p.x, v.cy - p.y)
        if (v.stone && d < best && !g.regions.claimed(v.spec.id)) { best = d; about = v.spec.id; img = v.stone }
      }
    }
    const cam = g.cameras.main
    const k = cam.zoom / DPR
    const toScreen = (b: any): R => ({ x: (b.x - cam.worldView.x) * k, y: (b.y - cam.worldView.y) * k, w: b.width * k, h: b.height * k })
    const bRect = img ? toScreen(img.getBounds()) : null
    const p = g.player
    // the hero's body: about 28 px wide, from the head to the feet
    const hRect = toScreen({ x: p.x - 14, y: p.y - 44, width: 28, height: 48 })
    const vw = g.scale.width / DPR, vh = g.scale.height / DPR
    const r = info.rect
    return {
      about: typeof about === 'string' ? about : about?.padId ?? null,
      side: info.side,
      rect: round(r),
      viewport: { w: vw, h: vh },
      frac: +((r.w * r.h) / (vw * vh)).toFixed(3),
      collapsed: info.collapsed,
      building: bRect ? round(bRect) : null,
      hero: round(hRect),
      overlapsBuilding: bRect ? hits(r, bRect) : false,
      overlapsHero: hits(r, hRect),
      targets: info.targets.map((t: any) => ({ name: t.name, cx: Math.round(t.x + t.w / 2), cy: Math.round(t.y + t.h / 2), w: Math.round(t.w), h: Math.round(t.h) })),
      minFont: Math.min(...info.fonts),
    }
  }

  /** Press the canvas at a CSS-pixel point with real DOM mouse events; hold for `holdS` seconds of game time. */
  const tap = (x: number, y: number, holdS = 0) => {
    const c = game.canvas
    const b = c.getBoundingClientRect()
    const o = { clientX: b.left + x, clientY: b.top + y, bubbles: true, cancelable: true, button: 0 }
    c.dispatchEvent(new MouseEvent('mousemove', { ...o, buttons: 0 }))
    c.dispatchEvent(new MouseEvent('mousedown', { ...o, buttons: 1 }))
    pump(Math.max(0.05, holdS))
    c.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }))
    pump(0.05)
  }

  /** S11: every standing waystone (`*` lit), the stone the hero is on, and what the travel list offers. */
  const stones = () => {
    const w = gs().waystones
    return {
      here: w.here,
      channel: w.channel,
      list: w.list().map((s: any) => `${s.id}${s.active ? '*' : ''}@${Math.round(s.x)},${Math.round(s.y)}`),
      offers: w.here ? w.list().filter((s: any) => s.active && s.id !== w.here).map((s: any) => ({ id: s.id, ...w.canTravel(s.id) })) : null,
    }
  }

  /**
   * S11: step onto stone `from` (lighting it), ask to travel to `to`, pump
   * `seconds`, and report where the hero and the soldiers who were within
   * the escort radius ended up.
   */
  const travel = (from: string, to: string, seconds = 1.6) => {
    const g = gs(); const w = g.waystones; const p = g.player
    const st = w.stone(from)
    if (!st) return `no stone "${from}"`
    tp(st.x, st.y + 10)
    const near = g.army.soldiers.filter((u: any) => u.alive && Math.hypot(u.x - p.x, u.y - p.y) <= 500)
    const ok = w.travel(to)
    pump(seconds)
    const dest = w.stone(to)
    return {
      ok, why: w.lastWhy, here: w.here, hero: [Math.round(p.x), Math.round(p.y)],
      dest: dest ? [Math.round(dest.x), Math.round(dest.y)] : null,
      escort: near.length,
      escortAtDest: dest ? near.filter((u: any) => Math.hypot(u.x - dest.x, u.y - dest.y) < 300).length : 0,
    }
  }

  /** S12: open (true) or close (false) the atlas, then report it and the bake. */
  const atlas = (open?: boolean) => {
    const u = ui()
    if (open === true && !u.atlas.open) u.openAtlas()
    if (open === false && u.atlas.open) u.atlas.close()
    return { ...u.atlas.inspect(), bake: gs().atlasBake.stats() }
  }
  const mini = () => ui().minimap.inspect()

  /** Set a pad's level outright through the loader (S13b): raises or razes, full hp. */
  const lvl = (id: string, level: number) => {
    gs().buildings.load([{ padId: id, level, hp: 1e9, progress: {}, peakWorkers: 0 }])
    pump(0.05)
    const b = pad(id)
    return b ? `${id}: ${b.key} Lv.${b.level}` : `no pad "${id}"`
  }

  /**
   * Stand `n` dev pads of one key (default cottages) in rows of six near the
   * hero, as if in `region` (so they wear its style), at `lvl`; wait for their
   * variants to bake. Tones and yard layouts counted (S13b C4).
   */
  const cottages = (region = 'downs', n = 12, at?: [number, number], key = 'cottage', level = 1) => {
    const g = gs(), p = g.player
    const [ox, oy] = at ?? [p.x - 225, p.y + 120]
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      const id = `dev.${key}.${region}.${i}`
      if (!g.buildings.byPad.has(id)) g.buildings.addPad({ id, key, x: ox + (i % 6) * 90, y: oy + Math.floor(i / 6) * 90, region })
      ids.push(id)
    }
    g.buildings.load(ids.map(padId => ({ padId, level, hp: 1e9, progress: {}, peakWorkers: 0 })))
    for (let k = 0; k < 60 && (k < 2 || g.buildings.looks.stats().queued > 0); k++) pump(0.05)
    const rows = ids.map(id => ({ id, ...g.buildings.looks.inspect(g.buildings.byPad.get(id)) }))
    return {
      style: rows[0]?.look.style, tones: new Set(rows.map(r => r.look.tone)).size,
      layouts: new Set(rows.map(r => `${r.yard.join('+')}:${r.side}`)).size,
      looks: rows.map(r => `${r.id.split('.').pop()} ${r.tex} ${r.yard.join('+')}${r.side < 0 ? ' L' : r.side > 0 ? ' R' : ''}`),
      textures: g.buildings.looks.stats(),
    }
  }
  /** Regional looks: texture counts against the cap, bakes and their ms; with an id, that pad's look and yard. */
  const looks = (id?: string) => {
    const g = gs()
    return id ? g.buildings.looks.inspect(g.buildings.byPad.get(id)) : g.buildings.looks.stats()
  }

  ;(window as any).H = { pump, start, goTo, pad, build, snap, gs, ui, game, gallery, tp, claim, burn, night, march, reveal, where, world, nav, watch, run, buildLine, wallGaps, assault, panel, tap, camp, leash, siege, stones, travel, atlas, mini, lvl, cottages, looks }
}
