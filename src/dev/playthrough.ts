import { CAMPS, THRONE } from '../config/world'
import { QUESTS } from '../config/quests'
import { makeProbe } from './probe'

/**
 * Dev-only playthrough (S22): a fresh start to the Regent's death on top of
 * S20's probe, which plays the economy, the claims and the nights (towers
 * included). Its fights are played for real instead of on the probe's
 * strength formula: every camp a quest names (a10's diggers to d10's Ashgate
 * Fortress: three braziers, then 18000 hp) and the Cinder Regent (e5). The
 * hero and the army are set down at the target (the walk is shortcut), fight
 * from early in the day until it runs short,
 * go home for the night and go back the next day; the fortress and the Regent
 * keep the hp they had. Alongside it logs deaths, lost nights (the hall
 * falls, the player rebuilds), stuck units (a worker or soldier with
 * somewhere to be that has not moved in 10 s) and console errors.
 *
 *   H.play.start(); H.play.run()   // repeat run() until `done`; each call stops after `wallMs`
 *
 * It saves over the real save as it goes: back the save up first.
 */

type G = any
interface PlayApi {
  gs: () => G
  ui: () => G
  pump: (s: number, stepMs?: number, headless?: boolean) => void
  start: (load?: boolean) => string
  tp: (x: number, y: number) => unknown
  questStep: (n?: number) => unknown
}

/** Each act's end in design 01 §Pacing targets: [wave, game-clock minute]. */
export const ACT_TARGETS: Record<string, [number, number]> = { I: [8, 16], II: [18, 42], III: [33, 90], IV: [45, 130], V: [50, 160] }
const FORTRESS = CAMPS.find(c => c.id === 'campAshgate')!
/** The camp each burn or boss quest names: fought for real, not burned on the probe's strength formula. */
const QUEST_CAMP: Record<string, string> = {}
for (const q of QUESTS) {
  const goal = q.goal as any
  const camp = goal.type === 'burn' ? goal.camp : goal.type === 'boss' ? CAMPS.find(c => c.boss === goal.key)?.id : undefined
  if (camp) QUEST_CAMP[q.id] = camp
}
const MOVING_W = new Set(['travel', 'carry'])

export function makePlaythrough(h: PlayApi) {
  const probe = makeProbe(h)
  let L: any = null

  /** `regentFrom`: the night before which the hero leaves the Regent be (a slower player's run: the hold meets nights to 50). */
  let regentFrom = 0
  const start = (load = false, o: { regentFrom?: number } = {}) => {
    regentFrom = o.regentFrom ?? 0
    probe.start({ real: Object.values(QUEST_CAMP) }, load)
    const g = h.gs()
    L = {
      deaths: { hero: 0, soldiers: 0, workers: 0 }, losses: [] as number[][], stuck: [] as any[], stuckN: 0,
      errors: [] as string[], errorsN: 0, fights: [] as any[], nextSample: 0, last: new Map<object, any>(), end: null,
    }
    g.bus.on('player:died', () => L.deaths.hero++)
    const sd = g.army.onSoldierDied.bind(g.army)
    g.army.onSoldierDied = (x: any) => { L.deaths.soldiers++; return sd(x) }
    const wd = g.workers.onWorkerDied.bind(g.workers)
    g.workers.onWorkerDied = (x: any) => { L.deaths.workers++; return wd(x) }
    g.bus.on('enemy:killed', ({ key }: any) => {
      if (key === 'cinderRegent') L.end = { wave: g.waves.wave, clockMin: min() }
    })
    const err = console.error
    console.error = (...a: any[]) => { L.errorsN++; if (L.errors.length < 12) L.errors.push(a.map(String).join(' ').slice(0, 140)); err(...a) }
    window.addEventListener('error', e => { L.errorsN++; if (L.errors.length < 12) L.errors.push(String(e.message).slice(0, 140)) })
    return 'playthrough started'
  }

  const min = () => +(probe.state().clock / 60).toFixed(1)

  /** Every 10 s of clock: a worker hauling, or a soldier with a target or a slot to reach, that has not moved. */
  const watch = (g: G) => {
    const s = probe.state()
    if (s.clock < L.nextSample) return
    L.nextSample = s.clock + 10
    const seen = new Map<object, any>()
    const flag = (u: any, kind: string, why: string) => {
      const was = L.last.get(u)
      if (was && was.why === why && Math.hypot(u.x - was.x, u.y - was.y) < 6) {
        L.stuckN++
        if (L.stuck.length < 20) L.stuck.push({ min: min(), wave: g.waves.wave, kind, key: u.key, at: [Math.round(u.x), Math.round(u.y)], why })
      }
      seen.set(u, { x: u.x, y: u.y, why })
    }
    for (const w of g.workers.workers) if (w.alive !== false && MOVING_W.has(w.state)) flag(w, 'worker', w.state)
    const p = g.player
    const heading = Math.atan2(p.vy, p.vx) || 0
    for (const x of g.army.soldiers) {
      if (!x.alive || x.state === 'hold') continue
      const t = x.target
      // a big army's formation reaches well past 220 px from the hero: measure from the soldier's own slot
      const slot = t ? null : g.army.slotPosition(x.slot, p.x, p.y, heading)
      const far = t ? Math.hypot(t.x - x.x, t.y - x.y) > x.def.range + (t.radius ?? 0) + 30 : Math.hypot(slot.x - x.x, slot.y - x.y) > 80
      if (far) flag(x, 'soldier', x.state)
    }
    L.last = seen
  }

  /** The scene stopped: a lost hall is rebuilt the way the player's button does it; a visibility pause is lifted. */
  const unblock = (g: G) => {
    const u = h.ui()
    if (u.levelUp?.open) u.levelUp.choose(0)
    else if (g.coreLost) {
      L.losses.push([g.waves.wave, min()])
      u.restartWave()
    } else {
      u.pause?.hide?.()
      u.resumeGame?.()
    }
    return g.scene.isActive()
  }

  /** The hero and the army stand off (x, y), as if they had walked there. */
  const setDown = (g: G, x: number, y: number) => {
    h.tp(x, y)
    for (const s of g.army.soldiers) {
      s.x = x + (Math.random() - 0.5) * 160
      s.y = y + 40 + Math.random() * 90
      s.follower?.clear?.()
    }
  }

  /** Early in the day, an army back at strength, and at most one assault a day. */
  const ready = (g: G, key: string) => {
    const last = L.fights.filter((f: any) => f.what === key).pop()
    const dawn = g.waves.phase === 'day' && g.waves.phaseT >= g.waves.dayLength * 0.6
    const army = g.army.count >= Math.max(3, Math.floor(g.popCap * probe.opts.armyShare * 0.8))
    return dawn && army && (!last || last.wave < g.waves.wave)
  }

  /**
   * One day's assault: set down by what `aim` points at (a brazier, the fortress, the Regent), fight while `done`
   * is false and the day has more than `walkS` left, then go home. The hero steps up to each new aim point as a
   * player would walk it (the army follows on foot); after a fall he wakes at an outpost and comes back.
   */
  const assault = (g: G, what: string, aim: () => { x: number; y: number } | null, done: () => boolean, hp: () => number, walkS = 45) => {
    const f: any = { what, wave: g.waves.wave, min: min(), army: g.army.count, power: Math.round(probe.power(g)), hp0: Math.round(hp()), heroDeaths: L.deaths.hero, soldierDeaths: L.deaths.soldiers }
    const a0 = aim()
    if (!a0) return null
    setDown(g, a0.x, a0.y + 120)
    let t = 0
    while (!done() && g.waves.phase === 'day' && g.waves.phaseT > walkS) {
      if (!g.scene.isActive() && !unblock(g)) break
      probe.step(g, true)
      watch(g)
      t += probe.opts.tick
      const a = aim()
      if (a && g.player.alive && Math.hypot(g.player.x - a.x, g.player.y - a.y) > 140) h.tp(a.x, a.y + 90)
    }
    Object.assign(f, {
      s: t, ok: done(), hp1: Math.round(hp()), army1: g.army.count,
      heroDeaths: L.deaths.hero - f.heroDeaths, soldierDeaths: L.deaths.soldiers - f.soldierDeaths,
    })
    L.fights.push(f)
    const hall = g.buildings.townHall
    setDown(g, hall.x, hall.y + 110)
    return f
  }

  /** A camp's hp and its wards' (boss, braziers). */
  const campHp = (g: G, camp: typeof FORTRESS) => {
    const rec = g.camps.camps.find((c: any) => c.spec.id === camp.id)
    const wards = (rec?.guards ?? []).filter((e: any) => e?.active && e.alive && (e.key === 'brazier' || e.key === camp.boss))
      .reduce((n: number, e: any) => n + e.hp, 0)
    return g.camps.isBurned(camp.id) ? 0 : wards + (rec?.enemy?.alive ? rec.enemy.hp : camp.hp)
  }

  const regentHp = (g: G) => {
    const r = g.enemies.list.find((e: any) => e.active && e.alive && e.key === 'cinderRegent')
    return r ? r.hp : g.quests.finalBossDefeated ? 0 : (g.quests.finalBossHp || 9400)
  }

  /** The fight today calls for, if any. */
  const fight = (g: G) => {
    const id = g.quests.current?.id
    const camp = CAMPS.find(c => c.id === QUEST_CAMP[id])
    if (camp && g.regions.claimed(camp.region) && !g.camps.isBurned(camp.id) && ready(g, camp.id)) {
      const rec = g.camps.camps.find((c: any) => c.spec.id === camp.id)
      // its wards first (a stronghold's boss, the fortress's braziers), nearest first; then the camp itself
      const aim = () => {
        const p = g.player
        const live = (rec?.guards ?? []).filter((e: any) => e?.active && e.alive && (e.key === 'brazier' || e.key === camp.boss))
          .sort((a: any, b: any) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
        return live[0] ?? camp
      }
      return assault(g, camp.id, aim, () => g.camps.isBurned(camp.id), () => campHp(g, camp))
    }
    if (id === 'e5' && g.camps.isBurned(FORTRESS.id) && g.waves.wave >= regentFrom && ready(g, 'regent')) {
      // she rises when the hero first sets foot on the opened causeway
      h.tp(THRONE.x, THRONE.y - 850)
      h.pump(1, probe.opts.stepMs, true)
      const her = () => g.enemies.list.find((e: any) => e.active && e.alive && e.key === 'cinderRegent') ?? null
      return assault(g, 'regent', her, () => !!g.quests.finalBossDefeated, () => regentHp(g))
    }
    return null
  }

  const run = (untilWave = 99, wallMs = 18_000) => {
    if (!L) start()
    const g = h.gs()
    const t0 = performance.now()
    while (!L.end && performance.now() - t0 < wallMs && !(g.waves.wave >= untilWave && g.waves.phase === 'day')) {
      if (!g.scene.isActive() && !unblock(g)) break
      if (performance.now() - t0 < wallMs / 2 && fight(g)) continue
      probe.step(g)
      watch(g)
    }
    return summary(g)
  }

  const summary = (g: G) => {
    const r = probe.report()
    const acts = r.acts.map((a: any, i: number) => {
      const next = r.acts[i + 1]
      const end = next ? [next.fromWave, next.fromMin] : L.end ? [L.end.wave, L.end.clockMin] : null
      return { act: a.act, from: [a.fromWave, a.fromMin], end, target: ACT_TARGETS[a.act], p50: a.p50, p90: a.p90, msMax: a.msMax }
    })
    return {
      done: !!L.end, wave: g.waves.wave, phase: g.waves.phase, clockMin: min(), quest: g.quests.current?.id ?? null,
      regent: L.end, acts, claims: r.claims, losses: L.losses, deaths: L.deaths, fights: L.fights,
      stuck: { n: L.stuckN, first: L.stuck.slice(0, 6) }, errors: { n: L.errorsN, first: L.errors.slice(0, 4) },
      army: g.army.count, towers: g.buildings.buildings.filter((b: any) => b.def.tower && b.level > 0).map((b: any) => b.level).join(''),
      hall: g.buildings.townHallLevel, nightShort: r.nightShort.length,
    }
  }

  return { start, run, summary: () => summary(h.gs()), probe, log: () => L }
}
