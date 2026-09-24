import type Phaser from 'phaser'
import { REGIONS, WALL_LINES, WORLD } from '../config/world'

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

  ;(window as any).H = { pump, start, goTo, pad, build, snap, gs, ui, game, gallery, tp, claim, burn, night, march, reveal, where, world, nav, watch, run, buildLine, wallGaps, assault }
}
