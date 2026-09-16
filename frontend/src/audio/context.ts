/**
 * The page's single AudioContext, shared by the music and the sound effects. Browsers cap how
 * many contexts a document may open, and — more to the point — only let one out of the
 * autoplay policy once a gesture has resumed it, so everything that makes a sound rides on
 * the one the Start button opened.
 */

let shared: AudioContext | null = null
/** Clock time up to which something is still ringing; see `holdUntil`. */
let busyUntil = 0

/** Null where the browser has no Web Audio: the game still plays, just in silence. */
export function audioContext(): AudioContext | null {
  if (shared) return shared
  if (typeof AudioContext === 'undefined') return null
  shared = new AudioContext()
  return shared
}

/**
 * Asks that the clock keep running until `time`. The music suspends the context when it
 * stops, which freezes the clock — without this, a clear that ends or pauses the game would
 * be chopped off a fraction of a second in.
 */
export function holdUntil(time: number): void {
  busyUntil = Math.max(busyUntil, time)
}

/** Seconds the context must stay awake for before it may be suspended. */
export function heldSeconds(): number {
  return shared ? Math.max(0, busyUntil - shared.currentTime) : 0
}
