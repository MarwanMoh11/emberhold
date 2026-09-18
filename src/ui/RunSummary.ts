import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL, CSS } from '../config/palette'
import { ZONES } from '../config/map'
import { QUESTS } from '../config/quests'
import { RESOURCE_ORDER } from '../core/types'
import { short } from '../core/math'
import type { GameScene } from '../scenes/GameScene'

/** Everything but the hold itself has to be paid for. */
const CLAIMABLE = ZONES.filter(z => !z.startsUnlocked).length

interface Cell {
  label: Phaser.GameObjects.Text
  value: Phaser.GameObjects.Text
}

/**
 * The campaign's payoff, and the ledger you can reopen afterwards.
 *
 * Finishing the chain used to produce a toast and nothing else — twenty quests
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
    this.heading = this.text(30, PAL.gold, true)
    this.sub = this.text(13, PAL.uiDim)
    this.foot = this.text(12, PAL.uiDim)
    for (let i = 0; i < 8; i++) {
      this.cells.push({
        label: this.text(10, PAL.uiDim),
        value: this.text(21, PAL.uiText, true),
      })
    }
    this.btn = this.button('HOLD THE LINE', () => this.scene.events.emit('closeScreen'), PAL.gold)
  }

  showVictory() { this.ensure(); this.victory = true; this.show() }
  showSummary() { this.ensure(); this.victory = false; this.show() }

  private figures(): [string, string][] {
    const g = this.game
    const q = g.quests.stats
    let hauled = 0
    for (const k of RESOURCE_ORDER) hauled += g.res.totalGathered[k]
    return [
      ['NIGHTS HELD', short(g.waves.wavesCleared)],
      ['SLAIN', short(g.combat.kills)],
      ['BOSSES FELLED', short(q.bossKills)],
      ['CAMPS RAZED', `${q.campsCleared}`],
      ['TERRITORY', `${q.zonesClaimed}/${CLAIMABLE}`],
      ['HERO LEVEL', `${g.player.level}`],
      ['TROOPS · CREW', `${g.army.count} · ${g.workers.count}`],
      ['HAULED', short(hauled)],
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

    const w = Math.min(c ? 620 : 430, this.W - 28)
    const headH = c ? 62 : 106
    const cellH = c ? 46 : 56
    const footH = c ? 58 : 86
    const h = Math.min(this.H - 20, headH + rows * cellH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, this.victory ? PAL.gold : PAL.uiEdge)

    this.heading
      .setText(this.victory ? 'FRONTIER SECURED' : 'RUN SUMMARY')
      .setColor(CSS(this.victory ? PAL.gold : PAL.uiText))
      .setPosition(cx, y + (c ? 26 : 42))
    this.fitText(this.heading, c ? 21 : 30, w - 36)

    const played = RunSummary.clock(this.game.saves.playtime)
    let subLine: string
    if (this.victory) {
      subLine = `Ashgate Fortress is rubble — night ${q.victoryWave}, ${played} in.`
    } else if (q.campaignComplete) {
      subLine = q.victoryWave
        ? `Frontier secured on night ${q.victoryWave}.  ${played} played.`
        : `Frontier secured.  ${played} played.`
    } else {
      subLine = `Objective ${Math.min(q.index + 1, QUESTS.length)} of ${QUESTS.length}`
        + `  ·  ${q.current?.title ?? ''}  ·  ${played} played`
    }
    this.sub.setText(subLine).setPosition(cx, y + (c ? 46 : 74))
    this.fitText(this.sub, c ? 11 : 13, w - 28)

    // ---- the figures ----------------------------------------------------
    const data = this.figures()
    const padX = c ? 20 : 26
    const gap = 8
    const cellW = (w - padX * 2 - gap * (cols - 1)) / cols
    const top = y + headH

    this.grid.clear()
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const col = i % cols
      const row = Math.floor(i / cols)
      const bx = x + padX + col * (cellW + gap)
      const by = top + row * cellH
      this.grid.fillStyle(PAL.uiBg, 0.55)
      this.grid.fillRoundedRect(bx, by, cellW, cellH - gap, 8)
      this.grid.lineStyle(1, PAL.uiEdge, 0.55)
      this.grid.strokeRoundedRect(bx, by, cellW, cellH - gap, 8)

      cell.label.setFontSize(c ? 9 : 10).setText(data[i][0])
        .setPosition(bx + cellW / 2, by + (c ? 13 : 16))
      cell.value.setFontSize(c ? 17 : 21).setText(data[i][1])
        .setColor(CSS(this.victory ? PAL.gold : PAL.uiText))
        .setPosition(bx + cellW / 2, by + (c ? 31 : 36))
    }

    // ---- footer ---------------------------------------------------------
    const bottom = y + h
    this.foot
      .setText(this.victory
        ? 'The horde does not stop coming. Neither do you.'
        : 'The nights keep coming. So does the hold.')
      .setPosition(cx, bottom - (c ? 48 : 64))
    this.fitText(this.foot, c ? 10 : 12, w - 28)
    this.btn.setLabel(this.victory ? 'HOLD THE LINE' : 'BACK')
    this.btn.place(cx, bottom - (c ? 22 : 32), Math.min(280, w - 80), c ? 30 : 38)
  }
}
