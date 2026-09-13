import { PIECE_TYPES, type PieceType } from './tetrominoes'

/** Deterministic PRNG state (mulberry32) so games are reproducible from a seed. */
export interface RngState {
  readonly seed: number
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 }
}

/** Returns the next float in [0, 1) and the advanced state. */
export function nextRandom(state: RngState): readonly [number, RngState] {
  let t = (state.seed + 0x6d2b79f5) >>> 0
  const next: RngState = { seed: t }
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}

/** 7-bag randomizer: every run of seven pieces contains each tetromino exactly once. */
export function nextBag(state: RngState): readonly [PieceType[], RngState] {
  const bag = [...PIECE_TYPES]
  let rng = state
  for (let i = bag.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(rng)
    rng = next
    const j = Math.floor(r * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return [bag, rng]
}
