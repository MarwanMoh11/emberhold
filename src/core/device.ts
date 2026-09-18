/**
 * What kind of machine are we on, and how hard should we push it?
 *
 * Read once at boot. A phone gets a smaller horde and cheaper effects, not a
 * smaller game: every system, building and wave is identical, there are simply
 * fewer bodies on screen at the peak so the frame budget survives.
 */

const coarse = typeof matchMedia === 'function'
  && matchMedia('(pointer: coarse)').matches

const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0

/** True on phones and tablets: a finger is the primary input. */
export const IS_TOUCH = coarse && touchPoints > 0

/**
 * iPadOS reports a desktop UA, so sniffing is unreliable; what matters here is
 * only whether we should budget like a phone, which the screen answers.
 */
const shortSide = typeof screen !== 'undefined'
  ? Math.min(screen.width, screen.height)
  : 1080

export const IS_PHONE = IS_TOUCH && shortSide <= 500

/**
 * 0 = phone, 1 = tablet or a weak laptop, 2 = desktop.
 * `deviceMemory` is Chromium-only; its absence is not evidence of anything, so
 * it can only ever downgrade a guess, never upgrade one.
 */
export const PERF_TIER: 0 | 1 | 2 = (() => {
  if (IS_PHONE) return 0
  if (IS_TOUCH) return 1
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
  if (mem !== undefined && mem <= 4) return 1
  return 2
})()

/** Horde size ceiling for this device. */
export const MAX_ENEMIES = PERF_TIER === 0 ? 170 : PERF_TIER === 1 ? 280 : 420

/** Default effects quality (the pause menu can still override it). */
export const DEFAULT_QUALITY: 0 | 1 | 2 = PERF_TIER === 0 ? 1 : 2

/**
 * iOS Safari puts the toolbar over the bottom of the viewport and the notch
 * over the top. The page CSS publishes the real insets as custom properties;
 * read them back so the HUD can keep its controls out from under the chrome.
 */
export function safeAreaInsets() {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  const s = getComputedStyle(document.documentElement)
  const px = (name: string) => {
    const v = parseFloat(s.getPropertyValue(name))
    return Number.isFinite(v) ? v : 0
  }
  return {
    top: px('--sat'), right: px('--sar'), bottom: px('--sab'), left: px('--sal'),
  }
}
