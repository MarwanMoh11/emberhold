import type { GameScene } from '../scenes/GameScene'
import { applyEvent, contractLine, dawnRng, isBoard, postContracts, settleAtDawn, type Contract, type ContractEvent } from './contracts'

/**
 * The hall's bounty board. Each dawn it settles the old board (Hold fast pays
 * if it never failed) and posts the next three for the coming night. Progress
 * comes off the bus, and a met contract is paid at once, as quests are.
 */
export class ContractManager {
  board: Contract[] = []

  constructor(private scene: GameScene) {
    const bus = scene.bus
    bus.on('enemy:killed', e => this.feed({ name: 'enemy:killed', key: e.key }))
    bus.on('building:built', () => this.feed({ name: 'building:built' }))
    bus.on('building:sacked', () => this.feed({ name: 'building:sacked' }))
    bus.on('soldier:recruited', () => this.feed({ name: 'soldier:recruited' }))
    bus.on('res:gained', e => this.feed({ name: 'res:gained', type: e.type, amount: e.amount }))
    // the night's wave is cleared at dawn; the board is for the one after it
    bus.on('wave:cleared', ({ wave }) => this.dawn(wave + 1))
  }

  private feed(e: ContractEvent) {
    this.board = this.board.map(c => {
      const next = applyEvent(c, e)
      if (next.state === 'done' && c.state === 'open') this.pay(next)
      return next
    })
  }

  private dawn(wave: number) {
    const { paid } = settleAtDawn(this.board)
    this.board = postContracts(wave, dawnRng(wave))
    for (const c of paid) this.pay(c)
  }

  /** Banked straight to the stores, as quest rewards are (not counted as gathered). */
  private pay(c: Contract) {
    const { res, bus } = this.scene
    res.addStored('coins', c.reward.coins, false)
    if (c.reward.crystal) res.addStored('crystal', c.reward.crystal, false)
    bus.emit('contract:complete', { id: c.id, title: contractLine(c), coins: c.reward.coins, crystal: c.reward.crystal ?? 0 })
  }

  toJSON(): Contract[] { return this.board.map(c => ({ ...c })) }

  /** A save from before contracts has no board: none until the next dawn. */
  load(d: unknown) { this.board = isBoard(d) ? d.map(c => ({ ...c })) : [] }
}
