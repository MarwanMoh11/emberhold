import { clamp, rr } from '../core/math'

type Voice = 'blip' | 'thud' | 'swish' | 'coin' | 'build' | 'boom' | 'horn' | 'chime' | 'zap' | 'crunch'

interface SfxSpec {
  voice: Voice
  freq: number
  dur: number
  gain: number
  /** frequency at the end of the sweep */
  to?: number
  detune?: number
}

const SFX: Record<string, SfxSpec> = {
  shoot:      { voice: 'swish', freq: 720, to: 420, dur: 0.08, gain: 0.10 },
  hit:        { voice: 'thud',  freq: 220, to: 120, dur: 0.07, gain: 0.13 },
  crit:       { voice: 'zap',   freq: 900, to: 300, dur: 0.14, gain: 0.18 },
  enemyDie:   { voice: 'crunch', freq: 180, to: 60, dur: 0.16, gain: 0.14 },
  playerHurt: { voice: 'thud',  freq: 150, to: 70,  dur: 0.20, gain: 0.22 },
  coin:       { voice: 'coin',  freq: 1180, to: 1720, dur: 0.09, gain: 0.10 },
  wood:       { voice: 'blip',  freq: 300, to: 380, dur: 0.07, gain: 0.09 },
  stone:      { voice: 'thud',  freq: 260, to: 200, dur: 0.08, gain: 0.10 },
  metal:      { voice: 'chime', freq: 1400, to: 1900, dur: 0.12, gain: 0.10 },
  deposit:    { voice: 'blip',  freq: 520, to: 880, dur: 0.06, gain: 0.08 },
  build:      { voice: 'build', freq: 190, to: 430, dur: 0.42, gain: 0.20 },
  upgrade:    { voice: 'chime', freq: 660, to: 1320, dur: 0.38, gain: 0.20 },
  levelup:    { voice: 'chime', freq: 520, to: 1560, dur: 0.6, gain: 0.24 },
  ability:    { voice: 'zap',   freq: 380, to: 1100, dur: 0.24, gain: 0.20 },
  boom:       { voice: 'boom',  freq: 120, to: 40,  dur: 0.42, gain: 0.26 },
  waveWarn:   { voice: 'horn',  freq: 180, to: 150, dur: 0.85, gain: 0.24 },
  bossRoar:   { voice: 'boom',  freq: 90,  to: 46,  dur: 1.1, gain: 0.32 },
  recruit:    { voice: 'blip',  freq: 440, to: 760, dur: 0.16, gain: 0.16 },
  quest:      { voice: 'chime', freq: 780, to: 1560, dur: 0.44, gain: 0.20 },
  deny:       { voice: 'blip',  freq: 260, to: 150, dur: 0.14, gain: 0.12 },
  ui:         { voice: 'blip',  freq: 620, to: 700, dur: 0.05, gain: 0.07 },
  repair:     { voice: 'thud',  freq: 340, to: 420, dur: 0.07, gain: 0.08 },
}

/**
 * Sound is synthesised with WebAudio rather than shipped as files: zero assets,
 * and every hook the design calls for is real audio from the first run.
 * Swap `play()` for sample playback later without touching call sites.
 */
export class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private lastPlay = new Map<string, number>()
  private musicTimer = 0
  private musicStep = 0
  private started = false

  volume = 0.8
  sfxVolume = 0.85
  musicVolume = 0.32
  muted = false

  /** Must be called from a user gesture on most browsers. */
  unlock() {
    if (this.started) {
      // A context created from a controller-driven title screen may be
      // suspended until the next real gesture. It can also suspend when a tab
      // is backgrounded; keep later inputs able to wake it.
      if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {})
      return
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = this.sfxVolume
      this.sfxGain.connect(this.master)
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = this.musicVolume
      this.musicGain.connect(this.master)

      const len = Math.floor(this.ctx.sampleRate * 0.4)
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const ch = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1
      this.started = true
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
    } catch {
      this.started = false
    }
  }

  applyVolumes() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume
  }

  play(name: keyof typeof SFX | string, pitch = 1, vol = 1) {
    const spec = SFX[name]
    if (!spec || !this.ctx || !this.sfxGain || this.muted) return
    // throttle: hundreds of simultaneous hits must not turn into a wall of noise
    const now = this.ctx.currentTime
    const last = this.lastPlay.get(name) ?? -1
    if (now - last < 0.028) return
    this.lastPlay.set(name, now)

    const t = now
    const out = this.ctx.createGain()
    out.gain.value = 0
    out.connect(this.sfxGain)

    const g = spec.gain * vol
    out.gain.setValueAtTime(0, t)
    out.gain.linearRampToValueAtTime(g, t + 0.006)
    out.gain.exponentialRampToValueAtTime(0.0008, t + spec.dur)

    const f0 = spec.freq * pitch
    const f1 = (spec.to ?? spec.freq) * pitch

    if (spec.voice === 'crunch' || spec.voice === 'boom' || spec.voice === 'build') {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noiseBuf
      src.loop = true
      const filt = this.ctx.createBiquadFilter()
      filt.type = spec.voice === 'boom' ? 'lowpass' : 'bandpass'
      filt.frequency.setValueAtTime(clamp(f0, 40, 12000), t)
      filt.frequency.exponentialRampToValueAtTime(clamp(f1, 40, 12000), t + spec.dur)
      filt.Q.value = spec.voice === 'crunch' ? 3 : 1
      src.connect(filt); filt.connect(out)
      src.start(t); src.stop(t + spec.dur + 0.02)
      if (spec.voice === 'boom') {
        const osc = this.ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(f0, t)
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + spec.dur)
        osc.connect(out); osc.start(t); osc.stop(t + spec.dur + 0.02)
      }
      return
    }

    const osc = this.ctx.createOscillator()
    osc.type = spec.voice === 'coin' || spec.voice === 'chime' ? 'triangle'
      : spec.voice === 'zap' ? 'sawtooth'
      : spec.voice === 'horn' ? 'sawtooth'
      : spec.voice === 'swish' ? 'sine' : 'square'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + spec.dur)
    if (spec.detune) osc.detune.value = spec.detune

    if (spec.voice === 'horn') {
      const filt = this.ctx.createBiquadFilter()
      filt.type = 'lowpass'; filt.frequency.value = 900
      osc.connect(filt); filt.connect(out)
    } else {
      osc.connect(out)
    }
    osc.start(t); osc.stop(t + spec.dur + 0.02)

    // second voice gives coins and chimes their sparkle
    if (spec.voice === 'coin' || spec.voice === 'chime') {
      const o2 = this.ctx.createOscillator()
      o2.type = 'sine'
      o2.frequency.setValueAtTime(f0 * 1.5, t)
      o2.frequency.exponentialRampToValueAtTime(Math.max(30, f1 * 1.5), t + spec.dur)
      const g2 = this.ctx.createGain()
      g2.gain.setValueAtTime(0, t)
      g2.gain.linearRampToValueAtTime(g * 0.5, t + 0.008)
      g2.gain.exponentialRampToValueAtTime(0.0008, t + spec.dur)
      o2.connect(g2); g2.connect(this.sfxGain)
      o2.start(t); o2.stop(t + spec.dur + 0.02)
    }
  }

  /** Sparse ambient pulse: a low drone that tightens at night. */
  updateMusic(dt: number, tension: number) {
    if (!this.ctx || !this.musicGain || this.muted || this.musicVolume <= 0) return
    this.musicTimer -= dt
    if (this.musicTimer > 0) return
    const beat = tension > 0.5 ? 0.46 : 0.78
    this.musicTimer = beat

    const scale = tension > 0.5 ? [55, 62, 65, 73, 82] : [65, 73, 82, 98, 110]
    const note = scale[this.musicStep % scale.length]
    this.musicStep++
    const t = this.ctx.currentTime
    const dur = beat * (tension > 0.5 ? 1.6 : 2.4)

    const osc = this.ctx.createOscillator()
    osc.type = tension > 0.5 ? 'sawtooth' : 'triangle'
    osc.frequency.value = note * (this.musicStep % 8 === 0 ? 2 : 1)
    const filt = this.ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.value = 380 + tension * 700
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.16 + tension * 0.12, t + 0.12)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
    osc.connect(filt); filt.connect(g); g.connect(this.musicGain)
    osc.start(t); osc.stop(t + dur + 0.05)

    if (tension > 0.5 && this.musicStep % 2 === 0 && this.noiseBuf) {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noiseBuf
      const hp = this.ctx.createBiquadFilter()
      hp.type = 'highpass'; hp.frequency.value = 3800
      const g2 = this.ctx.createGain()
      g2.gain.setValueAtTime(0.06, t)
      g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.09)
      src.connect(hp); hp.connect(g2); g2.connect(this.musicGain)
      src.start(t); src.stop(t + 0.1)
    }
  }

  /** Slight pitch jitter keeps repeated hits from sounding mechanical. */
  playVaried(name: string, vol = 1) { this.play(name, rr(0.92, 1.1), vol) }
}
