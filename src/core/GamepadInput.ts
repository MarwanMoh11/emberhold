export interface PadFrame {
  connected: boolean
  x: number
  y: number
  pressed: Set<number>
}

/** Poll a standard controller once per UI frame so it still works while Game is paused. */
export class GamepadInput {
  private previous: boolean[] = []
  private activeId: string | null = null

  read(): PadFrame {
    const empty = (): PadFrame => ({ connected: false, x: 0, y: 0, pressed: new Set() })
    let pads: (Gamepad | null)[]
    try { pads = [...(navigator.getGamepads?.() ?? [])] } catch { return empty() }
    const pad = pads.find(p => p?.connected && p.mapping === 'standard')
      ?? pads.find(p => p?.connected)
    if (!pad) {
      this.previous = []
      this.activeId = null
      return empty()
    }
    const buttons = pad.buttons.map(b => b.pressed || b.value > 0.55)
    const pressed = new Set<number>()
    if (this.activeId === pad.id) {
      buttons.forEach((down, i) => { if (down && !this.previous[i]) pressed.add(i) })
    }
    this.activeId = pad.id
    this.previous = buttons

    const axis = (v: number) => {
      const a = Math.abs(v)
      return a < 0.18 ? 0 : Math.sign(v) * Math.min(1, (a - 0.18) / 0.82)
    }
    let x = axis(pad.axes[0] ?? 0)
    let y = axis(pad.axes[1] ?? 0)
    if (buttons[14]) x = -1
    if (buttons[15]) x = 1
    if (buttons[12]) y = -1
    if (buttons[13]) y = 1
    return { connected: true, x, y, pressed }
  }
}
