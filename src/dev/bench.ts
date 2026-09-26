import type Phaser from 'phaser'
import { CAMPS, REGIONS, WALL_LINES } from '../config/world'
import { SOLDIERS, WORKER_FOR } from '../config/units'

/**
 * Dev-only frame benchmark (S21): a late-game fixture and a three-front night,
 * stepped at a fixed 60 fps clock while the wall time of every
 * `game.loop.step` is recorded.
 *
 *   H.bench().then(r => (window.__b = r))    then read window.__b (≈ 30–60 s of wall)
 *   H.bench({ seconds: 20, prof: true })     per-system ms per frame, worst first
 *
 * The fixture is a new game with regions of tier ≤ `tier` claimed and their
 * camps burned, every blueprint pad raised to `level` (walls too), crews to
 * `workers` (the save's cap is 500), `soldiers` troops, fog cleared, the hero
 * god-moded at the hall and saving stubbed out (the saves a new game writes
 * as it starts are put back). The night is wave `wave`, measured from dusk for `seconds` of game
 * time while the hero walks a slow square so the camera keeps streaming.
 * A frame is CPU time only (update + render submission); the GPU is async.
 * Frames are paced to real time (`paced`), so a 60 s run takes 60 s of wall;
 * it yields every ~250 ms so a long run spans several `javascript_tool` calls.
 */

type G = any
interface BenchApi {
  gs: () => G
  ui: () => G
  game: Phaser.Game
  step: (ms: number) => void
  pump: (s: number) => void
  start: (load?: boolean) => string
  tp: (x: number, y: number) => unknown
  buildAll: (level?: number) => unknown
  buildLine: (id: string, level?: number) => unknown
}

export interface BenchOpts {
  seconds?: number
  stepMs?: number
  wave?: number
  tier?: number
  level?: number
  workers?: number
  soldiers?: number
  /** Reuse the standing game instead of building the fixture again. */
  keep?: boolean
  /** Time each system's update (adds a little overhead of its own). */
  prof?: boolean
  /**
   * Hold each frame to its `stepMs` slot (busy-wait) so the GPU keeps up as
   * it would under vsync. Unpaced, frames go back to back, the GPU queue
   * fills and the CPU stalls in the pipeline flush: spikes no player sees.
   */
  paced?: boolean
}

const pct = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
const r2 = (v: number) => Math.round(v * 100) / 100
const yieldNow = () => new Promise<void>(res => { const c = new MessageChannel(); c.port1.onmessage = () => res(); c.port2.postMessage(0) })
const heapMb = () => { const m = (performance as any).memory; return m ? Math.round(m.usedJSHeapSize / 1048576) : null }

/** Display objects the camera will draw: culled (cameraFilter) and hidden ones left out, containers opened. */
function visibleCount(scene: G): number {
  const cam = scene?.cameras?.main
  if (!cam) return 0
  let n = 0
  const walk = (list: G[]) => {
    for (const o of list) {
      if (typeof o.willRender === 'function' && !o.willRender(cam)) continue
      if (Array.isArray(o.list)) walk(o.list)
      else n++
    }
  }
  walk(scene.sys.displayList.list)
  return n
}

export function makeBench(h: BenchApi) {
  let last: unknown = null

  const fixture = (o: Required<BenchOpts>) => {
    // a new game saves as it starts, before the stub below can land: put the saves back after
    const saved = (() => { try { return Object.keys(localStorage).filter(k => k.startsWith('emberhold.save')).map(k => [k, localStorage.getItem(k)!]) } catch { return null } })()
    h.start(false)
    const g = h.gs()
    g.saves.save = () => true
    try {
      if (saved) {
        for (const k of Object.keys(localStorage)) if (k.startsWith('emberhold.save') && !saved.some(e => e[0] === k)) localStorage.removeItem(k)
        for (const [k, v] of saved) localStorage.setItem(k, v)
      }
    } catch { /* storage blocked: nothing was written either */ }
    g.combat.god = true
    for (const r of REGIONS) if (r.tier <= o.tier) g.regions.claim(r.id, true)
    for (const c of CAMPS) if (g.regions.claimed(c.region)) g.camps.burn(c.id)
    g.regions.revealAll()
    h.buildAll(o.level)
    for (const l of WALL_LINES) h.buildLine(l.id, 1)
    let crew = g.workers.workers.length
    for (const b of g.buildings.byPad.values() as Iterable<G>) {
      const key = WORKER_FOR[b.key as keyof typeof WORKER_FOR]
      if (!key || !b.alive || b.level === 0) continue
      const slots = g.buildings.slotsOf(b)
      while (b.workers.length < slots && crew < o.workers) {
        const w = g.workers.hire(key, b, undefined, true)
        if (!w) break
        b.workers.push(w.id); b.peakWorkers = Math.max(b.peakWorkers, b.workers.length); crew++
      }
    }
    const hall = g.buildings.byPad.get('hall')
    const keys = Object.keys(SOLDIERS)
    for (let i = g.army.soldiers.length; i < o.soldiers; i++) {
      g.army.recruit(keys[i % keys.length], hall.x - 200 + (i % 15) * 28, hall.y + 90 + Math.floor(i / 15) * 22, true)
    }
    h.tp(hall.x, hall.y + 150)
    h.pump(2)
  }

  /** Wrap `obj[fn]` with a timer; returns the restore. */
  const wrap = (acc: Map<string, number>, name: string, obj: G, fn: string) => {
    const orig = obj?.[fn]
    if (typeof orig !== 'function') return () => {}
    const own = Object.prototype.hasOwnProperty.call(obj, fn)
    obj[fn] = function (this: G, ...a: unknown[]) {
      const t0 = performance.now()
      try { return orig.apply(this, a) } finally { acc.set(name, (acc.get(name) ?? 0) + performance.now() - t0) }
    }
    return () => { if (own) obj[fn] = orig; else delete obj[fn] }
  }

  const SYSTEMS: [string, string][] = [
    ['terrain', 'update'], ['atlasBake', 'update'], ['culler', 'update'], ['navDebug', 'update'], ['nav', 'tick'],
    ['player', 'update'], ['nodes', 'update'], ['buildings', 'update'], ['workers', 'update'], ['army', 'update'],
    ['buildings', 'auras'], ['enemies', 'update'], ['camps', 'update'], ['projectiles', 'update'], ['pickups', 'update'],
    ['abilities', 'update'], ['waves', 'update'], ['routeMarks', 'update'], ['regions', 'update'], ['waystones', 'update'],
    ['pois', 'update'], ['quests', 'update'], ['fx', 'update'], ['lighting', 'update'], ['saves', 'update'],
  ]

  const bench = async (opts: BenchOpts = {}) => {
    const o: Required<BenchOpts> = {
      seconds: 60, stepMs: 1000 / 60, wave: 30, tier: 3, level: 5, workers: 500, soldiers: 150, keep: false, prof: false, paced: true, ...opts,
    }
    if (!o.keep) fixture(o)
    const g = h.gs(); const u = h.ui()
    // the pane is usually hidden, and the UI pauses a hidden game
    const unpause = () => { if (!g.paused) return; if (u.pause?.open) u.pause.hide(); u.resumeGame?.() }
    // dusk of a three-front night
    const w = g.waves
    if (w.phase !== 'night') {
      w.wave = Math.max(0, o.wave - 1)
      w.forceNextWave()
      for (let k = 0; k < 400 && w.phase !== 'night'; k++) { unpause(); h.pump(0.1) }
    }
    const fronts = w.tonight.map((t: G) => t.id)

    const acc = new Map<string, number>()
    const restores: (() => void)[] = []
    if (o.prof) {
      for (const [k, fn] of SYSTEMS) restores.push(wrap(acc, fn === 'update' ? k : `${k}.${fn}`, g[k], fn))
      restores.push(wrap(acc, 'Game.update', g.sys, 'sceneUpdate'))
      restores.push(wrap(acc, 'UI.update', u.sys, 'sceneUpdate'))
      restores.push(wrap(acc, 'scenes.render', h.game.scene, 'render'))
    }

    const n = Math.round((o.seconds * 1000) / o.stepMs)
    const frames: number[] = []; const bakeMs: number[] = []; const flowMs: number[] = []; const pathMs: number[] = []
    const t0 = { bakes: g.terrain.stats().baked, rebuilds: g.nav.stats().rebuilds, searches: g.nav.stats().paths.searches }
    let visMax = 0, visSum = 0, visN = 0, uiVisMax = 0, walkersMax = 0, residentMax = 0, heapMax = heapMb() ?? 0
    let worstChunk = 0, flowFrames = 0, pathFrames = 0, lastBaked = t0.bakes
    const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
    const heap0 = heapMb()
    try {
      let chunkStart = performance.now()
      for (let i = 0; i < n; i++) {
        const d = dirs[Math.floor((i * o.stepMs) / 4000) % 4]
        g.moveInput.x = d[0] * 0.5; g.moveInput.y = d[1] * 0.5
        unpause()
        const a = performance.now()
        h.step(o.stepMs)
        frames.push(performance.now() - a)
        if (o.paced) while (performance.now() - a < o.stepMs) { /* hold the slot */ }
        const ts = g.terrain.stats(), ns = g.nav.stats()
        bakeMs.push(ts.frameMs); flowMs.push(ns.frameMs); pathMs.push(ns.paths.frameMs)
        if (ns.frameMs > 0) flowFrames++
        if (ns.paths.frameMs > 0) pathFrames++
        if (ts.baked !== lastBaked) { worstChunk = Math.max(worstChunk, ts.chunkMs); lastBaked = ts.baked }
        residentMax = Math.max(residentMax, ts.resident)
        walkersMax = Math.max(walkersMax, g.enemies.walkerCount)
        if (i % 30 === 0) {
          const v = visibleCount(g); visMax = Math.max(visMax, v); visSum += v; visN++
          uiVisMax = Math.max(uiVisMax, visibleCount(u))
          heapMax = Math.max(heapMax, heapMb() ?? 0)
        }
        if (performance.now() - chunkStart > 250) { await yieldNow(); chunkStart = performance.now() }
      }
    } finally {
      g.moveInput.x = 0; g.moveInput.y = 0
      for (const r of restores) r()
    }
    const s = [...frames].sort((x, y) => x - y)
    const stat = (xs: number[]) => { const q = [...xs].sort((x, y) => x - y); return { p95: r2(pct(q, 0.95)), max: r2(q[q.length - 1] ?? 0) } }
    const ts = g.terrain.stats(), ns = g.nav.stats()
    const res = {
      frames: n, stepMs: r2(o.stepMs), viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
      frameMs: { p50: r2(pct(s, 0.5)), p95: r2(pct(s, 0.95)), max: r2(s[s.length - 1] ?? 0), mean: r2(s.reduce((x, y) => x + y, 0) / (s.length || 1)) },
      night: { wave: w.wave, fronts, walkersMax, phaseAtEnd: w.phase },
      world: { pads: [...g.buildings.byPad.values()].filter((b: G) => b.level > 0).length, workers: g.workers.workers.length, soldiers: g.army.soldiers.length, textures: g.buildings.looks.stats() },
      chunks: { baked: ts.baked - t0.bakes, residentMax, bakeFrameMs: stat(bakeMs), worstChunkMs: r2(worstChunk), worstChunkMsEver: r2(ts.worstChunkMs) },
      flow: { rebuilds: ns.rebuilds - t0.rebuilds, sliceFrames: flowFrames, sliceMs: stat(flowMs), lastBuildMs: r2(ns.lastBuildMs) },
      astar: { searches: ns.paths.searches - t0.searches, frames: pathFrames, frameMs: stat(pathMs), worstSearchMs: r2(ns.paths.worstMs), queued: ns.paths.queued },
      visible: { gameMax: visMax, gameMean: Math.round(visSum / (visN || 1)), uiMax: uiVisMax, culler: g.culler.stats() },
      heapMb: { start: heap0, max: heapMax || null, end: heapMb() },
      prof: o.prof ? Object.fromEntries([...acc].sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, r2(v / n)])) : undefined,
    }
    last = res
    return res
  }

  return Object.assign(bench, { fixture: (opts: BenchOpts = {}) => fixture({ seconds: 60, stepMs: 1000 / 60, wave: 30, tier: 3, level: 5, workers: 500, soldiers: 150, keep: false, prof: false, paced: true, ...opts }), last: () => last })
}
