import Phaser from 'phaser'
import '@fontsource/grenze-gotisch/latin-600.css'
import '@fontsource/grenze-gotisch/latin-800.css'
import '@fontsource/alegreya-sans/latin-500.css'
import '@fontsource/alegreya-sans/latin-500-italic.css'
import '@fontsource/alegreya-sans/latin-700.css'
import '@fontsource/alegreya-sans/latin-800.css'
import '@fontsource/alegreya-sans-sc/latin-700.css'
import '@fontsource/alegreya-sans-sc/latin-800.css'
import { BootScene } from './scenes/BootScene'
import { GameScene } from './scenes/GameScene'
import { UIScene } from './scenes/UIScene'
import { PAL, CSS } from './config/palette'
import { FONT_FACES } from './ui/theme'
import { DPR, safeAreaInsets } from './core/device'

/**
 * The canvas is sized in device pixels and shown at CSS size, so nothing is
 * stretched by the browser: see DPR. RESIZE mode cannot do this — it always
 * sizes the canvas in CSS pixels — so the sizing is done here by hand instead,
 * from the parent's box.
 */
const deviceSize = () => {
  const el = document.getElementById('app')
  const w = Math.max(1, el?.clientWidth || window.innerWidth)
  const h = Math.max(1, el?.clientHeight || window.innerHeight)
  return { w: Math.round(w * DPR), h: Math.round(h * DPR) }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: CSS(PAL.uiBg),
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: 16,
    height: 16,
    zoom: 1 / DPR,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
    batchSize: 4096,
  },
  fps: { target: 60, min: 30 },
  input: { activePointers: 3 },
  scene: [BootScene, GameScene, UIScene],
}

/**
 * Boot, with a way out when it does not.
 *
 * Phaser sizes its framebuffer from the parent element, and starting against
 * a 0x0 parent throws "Framebuffer status: Incomplete Attachment" from inside
 * the render loop, where no try/catch of ours can see it. The page then sat on
 * the HTML splash saying "lighting the fires…" forever, with no retry, no
 * fallback and nothing to read. It takes an odd entrance to land there — a
 * hidden iframe, a bfcache restore, a window opened at zero size — but the
 * failure was permanent and silent, which is the worst shape a rare bug can
 * take.
 *
 * Three cheap guards, in order of how much they save:
 *   1. wait for #app to actually have room before starting Phaser at all;
 *   2. fall back to the Canvas renderer if WebGL will not come up;
 *   3. if the splash is still there when something throws — or after fifteen
 *      seconds of nothing — say so on the splash and offer a reload.
 */
const splash = document.getElementById('boot')
const parent = document.getElementById('app')

/** How long the splash is allowed to sit there before it owes an explanation. */
const PATIENCE = 15_000

let firstError = ''
let failTimer = 0

const stillWaiting = () => !!splash && !splash.classList.contains('gone')

function fail(reason: string) {
  if (!stillWaiting()) return
  window.clearTimeout(failTimer)
  // A tab in the background paints nothing, and that is not a fault. Hold the
  // bad news until someone is actually looking at the page.
  if (document.hidden) {
    document.addEventListener('visibilitychange', () => fail(reason), { once: true })
    return
  }
  const msg = document.getElementById('boot-msg')
  if (msg) msg.textContent = `the fires would not light — ${reason}`
  splash!.classList.add('failed')
}

function noteError(reason: string) {
  if (!firstError) firstError = reason || 'something threw during boot'
  // A throw while the splash is still up means the first frame never landed.
  fail(firstError)
}

window.addEventListener('error', e => noteError(e.message))
window.addEventListener('unhandledrejection', e => noteError(String(e.reason)))
document.getElementById('boot-retry')?.addEventListener('click', () => location.reload())

function launch() {
  let game: Phaser.Game
  const size = deviceSize()
  const sized = { ...config, scale: { ...config.scale, width: size.w, height: size.h } }
  try {
    game = new Phaser.Game(sized)
  } catch {
    // WebGL refused outright. Canvas is slower but it draws.
    game = new Phaser.Game({ ...sized, type: Phaser.CANVAS })
  }

  // Follow the parent's box. Orientation flips on mobile report their new
  // metrics a beat late, so those get a second look once they have settled.
  const fit = () => {
    const s = deviceSize()
    if (s.w !== game.scale.width || s.h !== game.scale.height) game.scale.resize(s.w, s.h)
  }
  window.addEventListener('resize', fit)
  window.addEventListener('orientationchange', () => setTimeout(fit, 150))
  if (typeof ResizeObserver === 'function' && parent) new ResizeObserver(fit).observe(parent)

  // handy for debugging from the console (and for the F2 panel's perf readout)
  ;(window as unknown as { emberhold: Phaser.Game }).emberhold = game

  // window.H — scripted-play helpers. Dev only; tree-shaken out of a build.
  if (import.meta.env.DEV) {
    import('./dev/harness').then(m => m.installHarness(game))
  }
}

/**
 * Fill the screen when the page comes up short of it. Opened from the iOS home
 * screen, the translucent status bar lets the page start at the very top edge,
 * but the viewport still leaves the bar's height off the bottom, and the game
 * sat over a dark strip under the home indicator. That exact shortfall — the
 * screen less the viewport equals the top inset — is the tell; a browser tab,
 * a Slide Over window or Android never matches it and is left alone.
 */
function fillScreen() {
  const root = document.documentElement
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  const w = window.innerWidth
  const h = Math.min(window.innerHeight, root.clientHeight || window.innerHeight)
  // iOS reports the screen in portrait whichever way it is held
  const screenH = h >= w ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
  const short = screenH - h
  const top = safeAreaInsets().top
  if (standalone && top > 0 && short > 0 && Math.abs(short - top) <= 4) root.style.setProperty('--app-h', `${screenH}px`)
  else root.style.removeProperty('--app-h')
}
fillScreen()
window.addEventListener('resize', fillScreen)
window.addEventListener('orientationchange', () => setTimeout(fillScreen, 150))

/**
 * Polled on a timer rather than requestAnimationFrame. A container that is
 * not being rendered — the 0x0 iframe, the hidden pane, the tab in the back —
 * gets no animation frames at all, so a rAF poll would never look again and
 * the game would never start even once the room appeared. Timers keep running,
 * throttled at worst, which is all this needs.
 */
function whenSized() {
  if ((parent?.clientWidth ?? 0) > 0 && (parent?.clientHeight ?? 0) > 0) {
    fontsReady().then(launch)
    return
  }
  window.setTimeout(whenSized, 250)
}

/**
 * Phaser rasterises a Text once, when it is set, so a face that lands a moment
 * after the title is drawn never shows up on it — the title would sit in a
 * fallback serif until something happened to change the words. Wait for the
 * faces first. They are bundled, so this is a local fetch; the cap is only for
 * a browser that refuses web fonts outright, which then gets the fallbacks.
 */
function fontsReady(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (!fonts?.load) return Promise.resolve()
  const all = Promise.all(FONT_FACES.map(f => fonts.load(f).catch(() => [])))
  const cap = new Promise<void>(resolve => window.setTimeout(resolve, 3500))
  return Promise.race([all.then(() => undefined), cap])
}

// Generous: baking a few hundred textures takes a real beat on a slow phone,
// and the splash is meant to cover that. This is for the case where it never
// ends at all.
failTimer = window.setTimeout(
  () => fail(firstError || 'the first frame never arrived'),
  PATIENCE,
)
whenSized()
