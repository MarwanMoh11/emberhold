import Phaser from 'phaser'

/** Small drawing toolkit shared by every procedural texture. */
export class Pen {
  readonly g: Phaser.GameObjects.Graphics

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics()
    this.g.setVisible(false)
  }

  clear() { this.g.clear(); return this }

  /** Commit the current drawing to a texture key and wipe the canvas. */
  bake(key: string, w: number, h: number) {
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key)
    this.g.generateTexture(key, Math.ceil(w), Math.ceil(h))
    this.g.clear()
  }

  destroy() { this.g.destroy() }

  fill(c: number, a = 1) { this.g.fillStyle(c, a); return this }
  line(w: number, c: number, a = 1) { this.g.lineStyle(w, c, a); return this }

  rect(x: number, y: number, w: number, h: number, r = 0) {
    if (r > 0) this.g.fillRoundedRect(x, y, w, h, r)
    else this.g.fillRect(x, y, w, h)
    return this
  }

  outline(x: number, y: number, w: number, h: number, r = 0) {
    if (r > 0) this.g.strokeRoundedRect(x, y, w, h, r)
    else this.g.strokeRect(x, y, w, h)
    return this
  }

  circle(x: number, y: number, r: number) { this.g.fillCircle(x, y, r); return this }
  ring(x: number, y: number, r: number) { this.g.strokeCircle(x, y, r); return this }
  ellipse(x: number, y: number, w: number, h: number) { this.g.fillEllipse(x, y, w, h); return this }
  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
    this.g.fillTriangle(x1, y1, x2, y2, x3, y3); return this
  }

  poly(pts: number[][]) {
    this.g.beginPath()
    this.g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) this.g.lineTo(pts[i][0], pts[i][1])
    this.g.closePath()
    this.g.fillPath()
    return this
  }

  /** Vertical two-tone band, cheap way to fake lighting. */
  shaded(x: number, y: number, w: number, h: number, top: number, bottom: number, r = 0) {
    this.fill(bottom).rect(x, y, w, h, r)
    this.fill(top).rect(x, y, w, h * 0.52, r)
    return this
  }
}

export const shade = (c: number, amt: number): number => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))))
  return (f(r) << 16) | (f(g) << 8) | f(b)
}
