import Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'
import { COMBAT } from '../config/balance'
import { rr, ri, short } from '../core/math'

interface FloatText {
  active: boolean
  txt: Phaser.GameObjects.Text
  vx: number
  vy: number
  life: number
  maxLife: number
}

/**
 * All the "juice". Every visible reaction in the game routes through here so
 * quality settings can scale it down in one place.
 */
export class EffectsManager {
  private texts: FloatText[] = []
  private layer: Phaser.GameObjects.Container
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter
  private chunks!: Phaser.GameObjects.Particles.ParticleEmitter
  private dustP!: Phaser.GameObjects.Particles.ParticleEmitter
  private coinsP!: Phaser.GameObjects.Particles.ParticleEmitter
  private smokeP!: Phaser.GameObjects.Particles.ParticleEmitter
  private embersP!: Phaser.GameObjects.Particles.ParticleEmitter

  /** 0 = low, 1 = medium, 2 = high */
  quality = 2
  showDamage = true
  reducedMotion = false

  private comboCount = 0
  private comboTimer = 0
  private comboAt = { x: 0, y: 0 }

  constructor(private scene: Phaser.Scene, depth: number) {
    this.layer = scene.add.container(0, 0).setDepth(depth)

    for (let i = 0; i < COMBAT.floatingTextMax; i++) {
      const txt = scene.add.text(0, 0, '', {
        fontFamily: 'Verdana, Geneva, sans-serif',
        fontSize: '15px', color: '#ffffff',
        stroke: '#0a1018', strokeThickness: 4,
      }).setOrigin(0.5).setVisible(false)
      this.layer.add(txt)
      this.texts.push({ active: false, txt, vx: 0, vy: 0, life: 0, maxLife: 1 })
    }

    const mk = (tex: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) =>
      scene.add.particles(0, 0, tex, { emitting: false, ...cfg }).setDepth(depth - 1)

    this.sparks = mk('fx_dot', {
      lifespan: { min: 180, max: 380 }, speed: { min: 60, max: 260 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD',
    })
    this.chunks = mk('fx_chunk', {
      lifespan: { min: 300, max: 620 }, speed: { min: 70, max: 300 },
      scale: { start: 1, end: 0.2 }, alpha: { start: 1, end: 0 },
      gravityY: 460, rotate: { start: 0, end: 360 },
    })
    this.dustP = mk('fx_smoke', {
      lifespan: { min: 320, max: 700 }, speed: { min: 20, max: 90 },
      scale: { start: 0.35, end: 1.1 }, alpha: { start: 0.42, end: 0 },
      tint: 0xd8c9a8,
    })
    this.smokeP = mk('fx_smoke', {
      lifespan: { min: 500, max: 1000 }, speed: { min: 10, max: 60 },
      scale: { start: 0.4, end: 1.6 }, alpha: { start: 0.5, end: 0 },
      tint: 0x4a4a4a, gravityY: -40,
    })
    this.coinsP = mk('res_coins', {
      lifespan: { min: 380, max: 700 }, speed: { min: 110, max: 320 },
      scale: { start: 0.9, end: 0.2 }, alpha: { start: 1, end: 0 },
      gravityY: 520, rotate: { start: 0, end: 200 },
    })
    this.embersP = mk('fx_dot', {
      lifespan: { min: 600, max: 1300 }, speed: { min: 8, max: 46 },
      scale: { start: 0.55, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xff9840, 0xffd24a], blendMode: 'ADD', gravityY: -60,
    })
  }

  private get budget() { return this.quality === 0 ? 0.35 : this.quality === 1 ? 0.7 : 1 }

  // ---- floating text --------------------------------------------------
  private obtainText(): FloatText | null {
    for (const t of this.texts) if (!t.active) return t
    return null
  }

  damage(x: number, y: number, amount: number, crit = false, tint = '#ffffff') {
    if (!this.showDamage) return
    if (this.quality === 0 && !crit && Math.random() > 0.4) return
    const t = this.obtainText()
    if (!t) return
    t.active = true
    t.txt.setText(crit ? `${short(amount)}!` : short(amount))
      .setColor(crit ? CSS(PAL.gold) : tint)
      .setFontSize(crit ? 24 : 15)
      .setStroke('#0a1018', crit ? 6 : 4)
      .setPosition(x + rr(-8, 8), y)
      .setScale(crit ? 0.4 : 1)
      .setAlpha(1)
      .setVisible(true)
    t.vx = rr(-30, 30)
    t.vy = crit ? -130 : -86
    t.maxLife = t.life = crit ? 0.95 : 0.62
    if (crit) {
      this.scene.tweens.add({ targets: t.txt, scale: 1.25, duration: 130, ease: 'Back.easeOut' })
    }
  }

  popup(x: number, y: number, text: string, colour = PAL.uiText, size = 20, rise = -70) {
    const t = this.obtainText()
    if (!t) return
    t.active = true
    t.txt.setText(text).setColor(CSS(colour)).setFontSize(size)
      .setStroke('#0a1018', 5).setPosition(x, y).setScale(0.5).setAlpha(1).setVisible(true)
    t.vx = 0
    t.vy = rise
    t.maxLife = t.life = 1.25
    this.scene.tweens.add({ targets: t.txt, scale: 1, duration: 180, ease: 'Back.easeOut' })
  }

  update(dt: number) {
    for (const t of this.texts) {
      if (!t.active) continue
      t.life -= dt
      if (t.life <= 0) {
        t.active = false
        t.txt.setVisible(false)
        continue
      }
      t.txt.x += t.vx * dt
      t.txt.y += t.vy * dt
      t.vy += 130 * dt
      const k = t.life / t.maxLife
      t.txt.setAlpha(k > 0.55 ? 1 : k / 0.55)
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0) this.comboCount = 0
    }
  }

  // ---- bursts ----------------------------------------------------------
  hitSpark(x: number, y: number, tint = 0xffe9b0, power = 1) {
    if (this.quality === 0 && Math.random() > 0.5) return
    this.sparks.setParticleTint(tint)
    this.sparks.explode(Math.max(1, Math.round(ri(3, 6) * power * this.budget)), x, y)
  }

  deathBurst(x: number, y: number, tint: number, scale = 1) {
    this.chunks.setParticleTint(tint)
    this.chunks.explode(Math.max(2, Math.round(ri(5, 9) * scale * this.budget)), x, y)
    this.sparks.setParticleTint(tint)
    this.sparks.explode(Math.max(2, Math.round(ri(4, 7) * scale * this.budget)), x, y)
  }

  coinBurst(x: number, y: number, count = 6) {
    this.coinsP.explode(Math.max(1, Math.round(count * this.budget)), x, y)
  }

  dust(x: number, y: number, count = 5) {
    this.dustP.explode(Math.max(1, Math.round(count * this.budget)), x, y)
  }

  smoke(x: number, y: number, count = 5) {
    this.smokeP.explode(Math.max(1, Math.round(count * this.budget)), x, y)
  }

  embers(x: number, y: number, count = 3) {
    this.embersP.explode(Math.max(1, Math.round(count * this.budget)), x, y)
  }

  explosion(x: number, y: number, radius: number, tint = 0xff9840) {
    this.ring(x, y, radius, tint, 0.34)
    this.sparks.setParticleTint(tint)
    this.sparks.explode(Math.round(18 * this.budget), x, y)
    this.smoke(x, y, Math.round(8 * this.budget))
    const flash = this.scene.add.image(x, y, 'fx_soft')
      .setTint(tint).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(radius * 2.2, radius * 2.2).setDepth(this.layer.depth - 1)
    this.scene.tweens.add({
      targets: flash, alpha: 0, scale: 1.5, duration: 260,
      onComplete: () => flash.destroy(),
    })
  }

  ring(x: number, y: number, radius: number, tint: number, dur = 0.4) {
    const r = this.scene.add.image(x, y, 'fx_ring')
      .setTint(tint).setDepth(this.layer.depth - 1).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(radius * 0.4, radius * 0.4)
    this.scene.tweens.add({
      targets: r, displayWidth: radius * 2, displayHeight: radius * 2, alpha: 0,
      duration: dur * 1000, ease: 'Cubic.easeOut',
      onComplete: () => r.destroy(),
    })
  }

  /** Holds the exact danger radius on the ground until a delayed attack lands. */
  warningCircle(x: number, y: number, radius: number, tint: number, seconds: number) {
    const g = this.scene.add.graphics().setPosition(x, y).setDepth(this.layer.depth - 2)
    g.fillStyle(tint, 0.12).fillCircle(0, 0, radius)
    g.lineStyle(4, tint, 0.82).strokeCircle(0, 0, radius)
    g.lineStyle(1, 0xffffff, 0.45).strokeCircle(0, 0, radius - 5)
    if (this.reducedMotion) {
      this.scene.time.delayedCall(seconds * 1000, () => g.destroy())
    } else {
      this.scene.tweens.add({ targets: g, alpha: 0.55, duration: seconds * 500,
        yoyo: true, onComplete: () => g.destroy() })
    }
  }

  slash(x: number, y: number, angle: number, scale: number, tint: number) {
    if (this.quality === 0) return
    const s = this.scene.add.image(x, y, 'fx_slash')
      .setTint(tint).setRotation(angle).setScale(scale * 0.5)
      .setDepth(this.layer.depth - 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.9)
    this.scene.tweens.add({
      targets: s, scale: scale, alpha: 0, duration: 200, ease: 'Cubic.easeOut',
      onComplete: () => s.destroy(),
    })
  }

  beam(x1: number, y1: number, x2: number, y2: number, tint: number, width = 3) {
    const g = this.scene.add.graphics().setDepth(this.layer.depth - 1).setBlendMode(Phaser.BlendModes.ADD)
    g.lineStyle(width, tint, 0.9)
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath()
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() })
  }

  /** Resource physically flying from A to B — the signature deposit effect. */
  flyResource(
    fromX: number, fromY: number, toX: number, toY: number,
    tex: string, delay = 0, onArrive?: () => void, scale = 1,
  ) {
    const img = this.scene.add.image(fromX, fromY, tex)
      .setDepth(this.layer.depth - 1).setScale(scale).setAlpha(0)
    const arcX = (fromX + toX) / 2 + rr(-46, 46)
    const arcY = (fromY + toY) / 2 - rr(46, 108)
    const dur = 300 + rr(0, 130)
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: dur, delay: delay * 1000, ease: 'Quad.easeIn',
      onStart: () => img.setAlpha(1),
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0
        const it = 1 - t
        img.x = it * it * fromX + 2 * it * t * arcX + t * t * toX
        img.y = it * it * fromY + 2 * it * t * arcY + t * t * toY
        img.rotation = t * 7
        img.setScale(scale * (1 - t * 0.55))
      },
      onComplete: () => { img.destroy(); onArrive?.() },
    })
  }

  shake(intensity: number, duration: number) {
    if (this.quality === 0 || this.reducedMotion) return
    this.scene.cameras.main.shake(duration * 1000, intensity * (this.quality === 1 ? 0.6 : 1), true)
  }

  flash(colour: number, duration = 0.16) {
    if (this.reducedMotion) return
    const c = this.scene.cameras.main
    c.flash(duration * 1000, (colour >> 16) & 255, (colour >> 8) & 255, colour & 255, true)
  }

  // ---- kill combo ------------------------------------------------------
  registerKill(x: number, y: number): { count: number; label: string | null } {
    this.comboCount++
    this.comboTimer = 2.2
    this.comboAt = { x, y }
    const c = this.comboCount
    let label: string | null = null
    if (c === 5) label = 'x5'
    else if (c === 10) label = 'x10  RAMPAGE'
    else if (c === 25) label = 'x25  HORDE BREAKER'
    else if (c === 50) label = 'x50  UNSTOPPABLE'
    else if (c === 100) label = 'x100  MASSACRE'
    else if (c === 200) label = 'x200  LEGEND OF EMBERHOLD'
    else if (c > 200 && c % 100 === 0) label = `x${c}`
    if (label) {
      this.popup(this.comboAt.x, this.comboAt.y - 34, label, c >= 25 ? PAL.gold : PAL.uiText, c >= 25 ? 26 : 20)
      this.shake(0.004 + Math.min(0.012, c * 0.00008), 0.18)
    }
    return { count: c, label }
  }

  get combo() { return this.comboCount }
}
