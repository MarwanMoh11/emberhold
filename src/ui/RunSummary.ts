import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL } from '../config/palette'
import { REGIONS } from '../config/world'
import { QUESTS } from '../config/quests'
import { RESOURCE_ORDER } from '../core/types'
import { short } from '../core/math'
import type { GameScene } from '../scenes/GameScene'

/** Everything but the hold itself has to be paid for. */
const CLAIMABLE = REGIONS.filter(z => z.id !== 'hold').length

interface Cell {
  label: Phaser.GameObjects.Text
  value: Phaser.GameObjects.Text
}

/**
 * The campaign's payoff, and the ledger you can reopen afterwards.
 *
 * Finishing the chain used to produce a toast and nothing else — many quests
 * of tutorial and campaign ending in a line of floating text. This is the
 * moment instead: what the frontier cost, in one card. It is emphatically not
 * a game over. One button, and the nights keep coming.
 */
export class RunSummary extends Overlay {
  /** True when this is the campaign-complete moment rather than a look back. */
  victory = false

  private built = false
  private heading!: Phaser.GameObjects.Text
  private sub!: Phaser.GameObjects.Text
  private foot!: Phaser.GameObjects.Text
  private grid!: Phaser.GameObjects.Graphics
  private cells: Cell[] = []
  private btn!: ReturnType<Overlay['button']>

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_160_000)
  }

  /** Built on first open: a screen most players see once should cost nothing at boot. */
  private ensure() {
    if (this.built) return
    this.built = true
    this.grid = this.gfx()
    this.heading = this.text(32, PAL.uiText, true)
    this.sub = this.text(13, PAL.uiDim)
    this.sub.setFontStyle('italic 500')
    this.foot = this.text(13, PAL.uiDim)
    this.foot.setFontStyle('italic 500')
    for (let i = 0; i < 8; i++) {
      this.cells.push({
        label: this.text(11, PAL.uiDim, true, 0.5, 0.5, 'caps'),
        value: this.text(24, PAL.uiText, true, 0.5, 0.5, 'display'),
      })
    }
    this.btn = this.button('Hold the line', () => this.scene.events.emit('closeScreen'), 'primary', 16)
  }

  showVictory() { this.ensure(); this.victory = true; this.show() }
  showSummary() { this.ensure(); this.victory = false; this.show() }

  private figures(): [string, string][] {
    const g = this.game
    const q = g.quests.stats
    let hauled = 0
    for (const k of RESOURCE_ORDER) hauled += g.res.totalGathered[k]
    return [
      ['Nights held', short(g.waves.wavesCleared)],
      ['Slain', short(g.combat.kills)],
      ['Bosses felled', short(q.bossKills)],
      ['Camps razed', `${q.campsCleared}`],
      ['Territory', `${q.zonesClaimed}/${CLAIMABLE}`],
      ['Hero level', `${g.player.level}`],
      ['Troops · crew', `${g.army.count} · ${g.workers.count}`],
      ['Hauled', short(hauled)],
    ]
  }

  private static clock(seconds: number) {
    const mins = Math.floor(seconds / 60)
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.max(1, mins)} min`
  }

  protected layout() {
    if (!this.built) return
    const c = this.compact
    const q = this.game.quests
    const cols = c ? 4 : 2
    const rows = Math.ceil(8 / cols)

    const w = Math.min(c ? 640 : 450, this.W - 24)
    const headH = c ? 66 : 116
    const cellH = c ? 50 : 62
    const footH = c ? 62 : 96
    const h = Math.min(this.H - 16, headH + rows * cellH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, this.victory ? PAL.gilt : PAL.wax)

    this.heading
      .setText(this.victory ? 'Frontier Secured' : 'Run Summary')
      .setPosition(cx, y + (c ? 28 : 46))
    this.ink(this.heading, this.victory ? PAL.gold : PAL.uiText)
    this.fitText(this.heading, c ? 24 : 36, w - 44)

    const played = RunSummary.clock(this.game.saves.playtime)
    let subLine: string
    if (this.victory) {
      subLine = `The Cinder Regent fell — night ${q.victoryWave}, ${played} in.`
    } else if (q.campaignComplete) {
      subLine = q.victoryWave
        ? `Frontier secured on night ${q.victoryWave}.  ${played} played.`
        : `Frontier secured.  ${played} played.`
    } else {
      subLine = `Objective ${Math.min(q.index + 1, QUESTS.length)} of ${QUESTS.length}`
        + `  ·  ${q.current?.title ?? ''}  ·  ${played} played`
    }
    this.sub.setText(subLine).setPosition(cx, y + (c ? 50 : 80))
    this.fitText(this.sub, c ? 12 : 14, w - 40)

    // ---- the figures ----------------------------------------------------
    const data = this.figures()
    const padX = c ? 24 : 30
    const gap = 8
    const cellW = (w - padX * 2 - gap * (cols - 1)) / cols
    const top = y + headH

    this.grid.clear()
    if (!c) this.rule(this.grid, cx, top - 14, Math.min(240, w - 80), this.victory ? PAL.gilt : PAL.wax)
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const col = i % cols
      const row = Math.floor(i / cols)
      const bx = x + padX + col * (cellW + gap)
      const by = top + row * cellH
      // a ledger box: ruled in ink, lightly washed
      this.grid.fillStyle(0x8a6a3a, 0.08)
      this.grid.fillRect(bx, by, cellW, cellH - gap)
      this.grid.lineStyle(1, 0x3a2616, 0.35)
      this.grid.strokeRect(bx, by, cellW, cellH - gap)

      cell.label.setFontSize(c ? 10 : 12).setText(data[i][0])
        .setPosition(bx + cellW / 2, by + (c ? 12 : 15))
      cell.value.setFontSize(c ? 20 : 26).setText(data[i][1])
        .setPosition(bx + cellW / 2, by + (c ? 30 : 37))
      this.ink(cell.value, this.victory ? PAL.gold : PAL.uiText)
    }

    // ---- footer ---------------------------------------------------------
    const bottom = y + h
    this.foot
      .setText(this.victory
        ? 'The horde does not stop coming. Neither do you.'
        : 'The nights keep coming. So does the hold.')
      .setPosition(cx, bottom - (c ? 50 : 70))
    this.fitText(this.foot, c ? 11 : 13, w - 40)
    this.btn.setLabel(this.victory ? 'Hold the line' : 'Back')
    this.btn.setTone(this.victory ? 'primary' : 'plain')
    this.btn.place(cx, bottom - (c ? 24 : 36), Math.min(260, w - 80), c ? 30 : 40)
  }
}
