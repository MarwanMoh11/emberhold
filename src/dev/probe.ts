import { CAMPS, POIS, REGIONS } from '../config/world'
import { BUILDINGS } from '../config/buildings'
import { SOLDIERS, WORKERS, WORKER_FOR } from '../config/units'
import { nightReward } from '../config/balance'

/**
 * Dev-only economy probe (S20): a scripted "reasonable player" run through
 * the harness's pump, logging per wave what the pacing targets in design 01
 * are measured in. It plays by the rules where the rules are cheap to follow
 * (costs are paid, pop caps hold, nights are fought by the army and the hero
 * at the hall) and shortcuts the walking: a build lands once every
 * `buildEvery` s instead of after a walk and a dwell, a camp burns once the
 * army's strength passes `burnPer` × its hp, and a hero errand (reach a POI,
 * travel, a relic) is done `errandS` s after its quest comes up.
 *
 *   H.probe.start(); H.probe.run(12); H.probe.report()
 *
 * `run` stops at the wave or after `wallMs` of real time, whichever is first,
 * so a long run is several calls. It pumps headless (no rendering).
 */

type G = any
interface ProbeApi {
  gs: () => G
  pump: (s: number, stepMs?: number, headless?: boolean) => void
  start: (load?: boolean) => string
  tp: (x: number, y: number) => unknown
  questStep: (n?: number) => unknown
}

/** The order a first-run player takes the frontier (optional regions left out). */
const CLAIM_ORDER = ['downs', 'whisperwood', 'hollow', 'greyfall', 'ferrow', 'frostmere', 'saltmere',
  'irontooth', 'barrowmoor', 'kettle', 'deepvein', 'rim', 'ashgate', 'crown']
const PRODUCTION = new Set(['lumberCamp', 'farm', 'quarry', 'mine', 'crystalDelve', 'fishery', 'tradingPost'])
const REWARDS = ['building:built', 'worker:hired', 'soldier:recruited', 'player:levelup', 'quest:complete',
  'region:claimed', 'camp:burned', 'poi:done', 'achievement', 'wave:cleared']
const MILESTONES = new Set(['quest:complete', 'region:claimed', 'camp:burned', 'poi:done', 'achievement', 'relic:granted'])
const RES = ['coins', 'wood', 'food', 'stone', 'metal', 'crystal'] as const

export function makeProbe(h: ProbeApi) {
  const opts = { buildEvery: 20, errandS: 60, reserve: 0.6, armyShare: 0.35, burnPer: 1 / 120, claimArmy: 3, surplus: 2.5, tick: 1, stepMs: 33 }
  let s: any = null

  const q = (xs: number[], p: number) => {
    if (!xs.length) return 0
    const a = [...xs].sort((x, y) => x - y)
    return Math.round(a[Math.min(a.length - 1, Math.floor(p * a.length))])
  }

  const start = (o: Partial<typeof opts> = {}) => {
    Object.assign(opts, o)
    h.start(false)
    const g = h.gs()
    s = {
      clock: 0, lastBuild: -99, lastPiece: -99, lastBurn: -99, questSince: 0, questId: null,
      events: [] as [number, string][], rows: [] as any[], claims: {} as Record<string, [number, number]>,
      acts: [] as [string, number, number][], burns: {} as Record<string, [number, number]>,
      night: null as any, lastRow: { t: 0, got: { ...g.res.totalGathered } }, nightOk: 0, nightShort: [] as number[],
    }
    for (const e of [...REWARDS, 'relic:granted']) g.bus.on(e, () => s.events.push([s.clock, e]))
    g.bus.on('region:claimed', (p: any) => { s.claims[p.id] = [g.waves.wave, Math.round(s.clock)] })
    g.bus.on('act:begun', (p: any) => s.acts.push([p.roman, g.waves.wave, Math.round(s.clock)]))
    g.bus.on('camp:burned', (p: any) => { s.burns[p.id ?? p.camp ?? '?'] = [g.waves.wave, Math.round(s.clock)] })
    g.bus.on('wave:start', () => {
      s.night = { w: g.workers.count, s: g.army.count, lv: levels(g), hall: 1 }
    })
    g.bus.on('wave:cleared', (p: any) => onCleared(g, p.wave))
    // the hero hunts all over claimed ground, and a stone he crosses must not claim by accident
    const canClaim = g.regions.canClaim.bind(g.regions)
    g.regions.canClaim = (id: string) => (s.claiming ? canClaim(id) : { ok: false, reason: 'probe', why: '' })
    home(g)
    return 'probe started'
  }

  const levels = (g: G) => g.buildings.buildings.reduce((n: number, b: any) => n + b.level, 0)
  const home = (g: G) => { const hall = g.buildings.townHall; h.tp(hall.x, hall.y + 110) }

  const nextClaim = (g: G) => REGIONS.find(r => r.id === CLAIM_ORDER.find(id => !g.regions.claimed(id)))

  const onCleared = (g: G, wave: number) => {
    const n = s.night ?? { w: 0, s: 0, lv: 0, hall: 1 }
    const dt = Math.max(1, s.clock - s.lastRow.t) / 60
    const got = g.res.totalGathered
    const inc = (k: string) => Math.round(((got[k] ?? 0) - (s.lastRow.got[k] ?? 0)) / dt)
    // the night's reward against the cheapest build open now
    const reward = Math.round(nightReward(wave) * g.buildings.nightBlessing())
    const cheapest = Math.min(...candidates(g).map(c => c.cost.coins ?? 0))
    if (cheapest <= reward) s.nightOk++
    else s.nightShort.push(wave)
    const st = g.res.stored
    s.rows.push([wave, Math.round(s.clock), g.regions.claimedCount, ...RES.map(k => Math.round(st[k])),
      inc('coins'), inc('wood'), inc('food'), inc('stone'), inc('metal'),
      Math.max(0, n.w - g.workers.count), Math.max(0, n.s - g.army.count), Math.max(0, n.lv - levels(g)),
      Math.round(n.hall * 100), g.buildings.townHallLevel, g.workers.count, g.army.count, g.quests.current?.id ?? '-'])
    s.lastRow = { t: s.clock, got: { ...got } }
    s.night = null
  }

  /** Pads the probe may raise next: open, below max, not wall pieces. */
  const candidates = (g: G) => {
    const out: { b: any; cost: Record<string, number> }[] = []
    for (const b of g.buildings.buildings) {
      if (b.padId.includes('.') || b.key === 'wall' || b.key === 'gate') continue
      if (!g.buildings.isPadAvailable(b)) continue
      const def = BUILDINGS[b.key as keyof typeof BUILDINGS]
      if (b.level >= def.levels.length || b.state === 'raising') continue
      out.push({ b, cost: def.levels[b.level].cost as Record<string, number> })
    }
    return out
  }

  const afford = (g: G, cost: Record<string, number>, reserve: Record<string, number> | null) =>
    RES.every(k => (g.res.stored[k] ?? 0) - (cost[k] ?? 0) >= (reserve?.[k] ?? 0))

  const raise = (g: G, b: any, cost: Record<string, number>) => {
    g.res.spend(cost)
    g.buildings.finishRaise(b)
  }

  const questTarget = (g: G, b: any): boolean => {
    const goal = g.quests.current?.goal
    if (!goal) return false
    if (goal.type === 'build') return b.key === goal.building && (!goal.region || b.region === goal.region)
    if (goal.type === 'upgrade') return b.key === goal.building && b.level < goal.level
    if (goal.type === 'settle') return b.region === goal.region
    return false
  }

  const decideBuild = (g: G) => {
    if (s.clock - s.lastBuild < opts.buildEvery) return
    const next = wanted(g) ?? nextClaim(g)
    const needHall = next && g.buildings.townHallLevel < next.hall
    const reserve: Record<string, number> = {}
    if (next && !needHall) for (const k of RES) reserve[k] = ((next.cost as any)[k] ?? 0) * opts.reserve
    const popTight = g.popUsed >= g.popCap - 2
    let best: { b: any; cost: any; score: number } | null = null
    for (const c of candidates(g)) {
      const { b } = c
      const quest = questTarget(g, b)
      const hall = b.key === 'townHall' && needHall
      if (!afford(g, c.cost, quest || hall ? null : reserve)) continue
      let score = 100
      if (quest) score = 1000
      else if (hall) score = 900
      else if ((b.key === 'house' || b.key === 'cottage') && popTight) score = 600
      else if (PRODUCTION.has(b.key)) score = b.level === 0 ? 500 : 300
      else if ((b.key === 'barracks' || b.key === 'archeryRange') && b.level === 0) score = 450
      else if (b.key === 'townHall') score = 700
      const total = Object.values(c.cost as Record<string, number>).reduce((a, v) => a + v, 0)
      score -= total / 100
      if (!best || score > best.score) best = { ...c, score }
    }
    if (best) { raise(g, best.b, best.cost); s.lastBuild = s.clock }
  }

  /** A wall line the quest asks for goes up a piece every `buildEvery / 4` s, as the hero walks it. */
  const decideLine = (g: G) => {
    const goal = g.quests.current?.goal
    if (goal?.type !== 'line' || s.clock - s.lastPiece < opts.buildEvery / 4) return
    const b = g.buildings.linePads(goal.line).find((x: any) => x.level === 0 && g.buildings.isPadAvailable(x))
    if (!b) return
    const cost = BUILDINGS[b.key as keyof typeof BUILDINGS].levels[0].cost as Record<string, number>
    if (!g.res.canAfford(cost)) return
    raise(g, b, cost)
    s.lastPiece = s.clock
  }

  /** The region the current quest wants claimed next: its claim, a zone count, or ground its goal stands on. */
  const wanted = (g: G) => {
    const goal = g.quests.current?.goal
    if (!goal) return null
    let id: string | undefined
    if (goal.type === 'claim') id = goal.region
    else if (goal.type === 'zone') id = CLAIM_ORDER.find(r => !g.regions.claimed(r))
    else if (goal.type === 'build' || goal.type === 'settle') id = goal.region
    else if (goal.type === 'burn') id = CAMPS.find(c => c.id === goal.camp)?.region
    else if (goal.type === 'boss') id = CAMPS.find(c => c.boss === goal.key)?.region
    else if (goal.type === 'reach') id = POIS.find(p => p.id === goal.poi)?.region
    if (!id || g.regions.claimed(id)) return null
    // the first unclaimed region on its way from the hold
    let r = REGIONS.find(x => x.id === id)
    while (r && !g.regions.claimed(r.claim.from)) { const from = r.claim.from; r = REGIONS.find(x => x.id === from) }
    return r ?? null
  }

  const decideClaim = (g: G) => {
    if (g.waves.phase !== 'day') return
    const want = wanted(g)
    const next = want ?? nextClaim(g)
    if (!next) return
    // with no quest asking, only a surplus pays for new ground
    if (!want && !RES.every(k => (g.res.stored[k] ?? 0) >= ((next.cost as any)[k] ?? 0) * opts.surplus)) return
    // a reasonable player brings an army to new ground: its camp wakes on the claim
    if (g.army.count < opts.claimArmy * next.tier) return
    s.claiming = true
    const ok = g.regions.canClaim(next.id).ok
    s.claiming = false
    if (!ok) return
    g.res.spend(next.cost)
    g.regions.claim(next.id)
  }


  const decideHire = (g: G) => {
    for (const b of g.buildings.buildings) {
      if (b.level === 0) continue
      const wkey = WORKER_FOR[b.key as keyof typeof WORKER_FOR]
      if (!wkey || b.workers.length >= g.buildings.slotsOf(b)) continue
      const def = WORKERS[wkey]
      if (g.popUsed + def.pop > g.popCap || !g.res.canAfford(def.cost)) continue
      g.res.spend(def.cost)
      const w = g.workers.hire(wkey, b)
      if (w) { b.workers.push(w.id); b.peakWorkers = Math.max(b.peakWorkers, b.workers.length) }
      return
    }
  }

  const decideRecruit = (g: G) => {
    const target = Math.floor(g.popCap * opts.armyShare)
    for (let i = 0; i < 3 && g.army.count < target; i++) {
      const b = g.buildings.buildings.find((x: any) => x.level > 0 && (x.key === 'barracks' || x.key === 'archeryRange')
        && g.buildings.trainsAt(x) && g.res.canAfford(SOLDIERS[g.buildings.trainsAt(x) as keyof typeof SOLDIERS].cost))
      if (!b) return
      const key = g.buildings.trainsAt(b)
      if (g.popUsed + SOLDIERS[key as keyof typeof SOLDIERS].pop > g.popCap) return
      g.res.spend(SOLDIERS[key as keyof typeof SOLDIERS].cost)
      g.army.recruit(key, b.x, b.y + 14)
    }
  }

  /** Strength in swordsmen: soldiers by hp × damage against a swordsman's, and the hero at 4 plus 0.5 a level. */
  const power = (g: G) => g.army.soldiers.reduce((n: number, x: any) => {
    const d = SOLDIERS[x.key as keyof typeof SOLDIERS]
    return n + (d.hp * d.damage) / (110 * 11)
  }, 4 + 0.5 * (g.levels?.level ?? 1))

  const decideBurn = (g: G) => {
    if (g.waves.phase !== 'day' || s.clock - s.lastBurn < 60) return
    const p = power(g)
    const camp = CAMPS.filter(c => g.regions.claimed(c.region) && !g.camps.isBurned(c.id))
      .sort((a, b) => a.hp - b.hp)[0]
    if (camp && p >= camp.hp * opts.burnPer) {
      g.camps.burn(camp.id)
      s.lastBurn = s.clock
    }
  }

  /** By day the hero runs down walkers on claimed ground (the walk is shortcut); by night he holds the hall. */
  const decideHunt = (g: G) => {
    if (g.waves.phase !== 'day') { if (!s.home) { home(g); s.home = true } return }
    s.home = false
    const p = g.player
    let best: any = null, bd = Infinity
    for (const e of g.enemies.list) {
      if (!e.active || !e.alive || e.def.structure || !g.regions.claimedAt(e.x, e.y)) continue
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      if (d < bd) { bd = d; best = e }
    }
    if (best && bd > 160) h.tp(best.x, best.y + 90)
    else if (!best && bd === Infinity && !s.atHall) home(g)
    s.atHall = !best
  }

  const decideErrand = (g: G) => {
    const cur = g.quests.current
    if (!cur) return
    if (cur.id !== s.questId) { s.questId = cur.id; s.questSince = s.clock; return }
    if (s.clock - s.questSince < opts.errandS) return
    const goal = cur.goal
    if (goal.type === 'reach' || goal.type === 'travel' || goal.type === 'relic') { h.questStep(1); home(g) }
    else if (goal.type === 'restore') {
      const shrine = POIS.find(p => p.kind === 'shrine' && g.regions.claimed(p.region) && g.pois.state(p.id) !== 'done')
      if (shrine) g.pois.interact(shrine.id) // pays its own cost, or waits
    }
  }

  const run = (untilWave = 12, wallMs = 50_000) => {
    if (!s) start()
    const g = h.gs()
    const t0 = performance.now()
    while (g.waves.wave < untilWave || g.waves.phase !== 'day') {
      if (performance.now() - t0 > wallMs) break
      if (!g.scene.isActive()) return { paused: g.scene.key, wave: g.waves.wave, clockMin: +(s.clock / 60).toFixed(1) }
      h.pump(opts.tick, opts.stepMs, true)
      s.clock += opts.tick
      if (s.night) s.night.hall = Math.min(s.night.hall, g.buildings.townHall.hp / g.buildings.townHall.maxHp)
      decideHunt(g)
      decideErrand(g)
      decideClaim(g)
      decideBurn(g)
      decideHire(g)
      decideRecruit(g)
      decideBuild(g)
      decideLine(g)
    }
    return { wave: g.waves.wave, phase: g.waves.phase, clockMin: +(s.clock / 60).toFixed(1), wallS: Math.round((performance.now() - t0) / 1000) }
  }

  /** Reward gaps (s) inside [a, b) of the clock: all rewards, and milestones only. */
  const gaps = (a: number, b: number) => {
    const all = s.events.filter(([t]: [number]) => t >= a && t < b).map(([t]: [number]) => t)
    const ms = s.events.filter(([t, e]: [number, string]) => t >= a && t < b && MILESTONES.has(e)).map(([t]: [number]) => t)
    const d = (xs: number[]) => xs.slice(1).map((t, i) => t - xs[i])
    const ga = d([a, ...all]), gm = d([a, ...ms])
    return { n: all.length, p50: q(ga, 0.5), p90: q(ga, 0.9), max: q(ga, 1), msMax: q(gm, 1) }
  }

  const report = () => {
    const bounds = [0, ...s.acts.slice(1).map((x: any) => x[2]), s.clock]
    const acts = s.acts.map((x: any, i: number) => ({ act: x[0], fromWave: x[1], fromMin: +(x[2] / 60).toFixed(1), ...gaps(bounds[i], bounds[i + 1]) }))
    return {
      cols: 'wave,clockS,claimed,coins,wood,food,stone,metal,crystal,inc/min c,w,f,s,m,lostW,lostS,lostLv,hall%,hallLv,workers,army,quest',
      rows: s.rows, claims: s.claims, burns: s.burns, acts, nightOk: s.nightOk, nightShort: s.nightShort,
    }
  }

  return { start, run, report, opts, state: () => s }
}
