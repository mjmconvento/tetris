// Pure, deterministic Tetris rules. No DOM, no timers: the loop feeds elapsed time
// into `tick` and input into the action functions; every function returns a new state.

import { createRng, nextBag, nextRandom, type RngState } from './rng'
import { SHAPES, kicksFor, type PieceType, type Point, type Rotation } from './tetrominoes'

export const COLS = 10
export const VISIBLE_ROWS = 20
/** Rows above the visible field where pieces spawn. */
export const HIDDEN_ROWS = 2
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS
export const PREVIEW_COUNT = 3
export const LINES_PER_LEVEL = 10
export const LOCK_DELAY_MS = 500
/** Moves/rotations that may postpone locking once a piece has landed. */
export const MAX_LOCK_RESETS = 15

const LINE_POINTS = [0, 100, 300, 500, 800] as const
const SOFT_DROP_POINTS = 1
const HARD_DROP_POINTS = 2
const SPAWN_X = 3
const SPAWN_Y = 0

export type Cell = PieceType | null
export type Board = readonly (readonly Cell[])[]

export interface ActivePiece {
  readonly type: PieceType
  readonly rotation: Rotation
  /** Top-left of the piece's bounding box on the board. */
  readonly x: number
  readonly y: number
}

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over'

export interface GameState {
  readonly board: Board
  readonly active: ActivePiece | null
  readonly hold: PieceType | null
  /** Hold may be used once per piece. */
  readonly holdUsed: boolean
  /** Upcoming pieces; always at least PREVIEW_COUNT long while playing. */
  readonly queue: readonly PieceType[]
  readonly rng: RngState
  readonly score: number
  readonly lines: number
  readonly level: number
  readonly status: GameStatus
  /** Time accumulated towards the next gravity step. */
  readonly gravityMs: number
  /** Time the piece has rested on a surface, or null while airborne. */
  readonly lockMs: number | null
  readonly lockResets: number
}

export function levelFor(lines: number): number {
  return 1 + Math.floor(lines / LINES_PER_LEVEL)
}

/** Tetris Guideline gravity curve, clamped so very high levels stay finite. */
export function gravityIntervalMs(level: number): number {
  const l = Math.min(level, 20) - 1
  return Math.max(Math.pow(0.8 - l * 0.007, l) * 1000, 1000 / 60)
}

export function cellsOf(piece: ActivePiece): Point[] {
  return SHAPES[piece.type][piece.rotation].map((c) => ({ x: piece.x + c.x, y: piece.y + c.y }))
}

export function fits(board: Board, piece: ActivePiece): boolean {
  for (const c of cellsOf(piece)) {
    if (c.x < 0 || c.x >= COLS || c.y < 0 || c.y >= ROWS) return false
    if (board[c.y][c.x] !== null) return false
  }
  return true
}

/** Lowest y the piece can fall to from its current position. */
export function ghostY(board: Board, piece: ActivePiece): number {
  let y = piece.y
  while (fits(board, { ...piece, y: y + 1 })) y++
  return y
}

function fillQueue(queue: readonly PieceType[], rng: RngState, minLength: number): readonly [readonly PieceType[], RngState] {
  let q = queue
  let r = rng
  while (q.length < minLength) {
    const [bag, next] = nextBag(r)
    q = [...q, ...bag]
    r = next
  }
  return [q, r]
}

export function createGame(seed: number = Date.now()): GameState {
  const [queue, rng] = fillQueue([], createRng(seed), PREVIEW_COUNT + 1)
  return {
    board: Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null)),
    active: null,
    hold: null,
    holdUsed: false,
    queue,
    rng,
    score: 0,
    lines: 0,
    level: 1,
    status: 'ready',
    gravityMs: 0,
    lockMs: null,
    lockResets: 0,
  }
}

/** Fresh game (new seed derived from the old one) that is immediately playing. */
export function start(state: GameState): GameState {
  const [r] = nextRandom(state.rng)
  return spawnNext({ ...createGame(Math.floor(r * 0xffffffff)), status: 'playing' })
}

export function togglePause(state: GameState): GameState {
  if (state.status === 'playing') return { ...state, status: 'paused' }
  if (state.status === 'paused') return { ...state, status: 'playing' }
  return state
}

function spawnPiece(state: GameState, type: PieceType): GameState {
  const piece: ActivePiece = { type, rotation: 0, x: SPAWN_X, y: SPAWN_Y }
  const base = { ...state, gravityMs: 0, lockMs: null, lockResets: 0 }
  if (!fits(state.board, piece)) {
    // Block out: the new piece overlaps the stack.
    return { ...base, active: piece, status: 'over' }
  }
  // Guideline: a spawned piece immediately drops one row when it can, so it becomes visible.
  const dropped = { ...piece, y: piece.y + 1 }
  return { ...base, active: fits(state.board, dropped) ? dropped : piece }
}

function spawnNext(state: GameState): GameState {
  const [type, ...rest] = state.queue
  const [queue, rng] = fillQueue(rest, state.rng, PREVIEW_COUNT)
  return spawnPiece({ ...state, queue, rng, holdUsed: false }, type)
}

function lock(state: GameState): GameState {
  const piece = state.active
  if (!piece) return state
  const cells = cellsOf(piece)
  if (cells.every((c) => c.y < HIDDEN_ROWS)) {
    // Lock out: the piece settled entirely above the visible field.
    return { ...state, status: 'over' }
  }

  const board = state.board.map((row) => [...row])
  for (const c of cells) board[c.y][c.x] = piece.type

  const remaining = board.filter((row) => row.some((cell) => cell === null))
  const cleared = ROWS - remaining.length
  while (remaining.length < ROWS) remaining.unshift(Array<Cell>(COLS).fill(null))

  const lines = state.lines + cleared
  return spawnNext({
    ...state,
    board: remaining,
    active: null,
    score: state.score + LINE_POINTS[cleared] * state.level,
    lines,
    level: levelFor(lines),
  })
}

/** A successful move or rotation postpones locking, a bounded number of times. */
function shifted(state: GameState, piece: ActivePiece): GameState {
  if (state.lockMs === null || state.lockResets >= MAX_LOCK_RESETS) {
    return { ...state, active: piece }
  }
  return { ...state, active: piece, lockMs: 0, lockResets: state.lockResets + 1 }
}

export function moveHorizontal(state: GameState, dx: -1 | 1): GameState {
  if (state.status !== 'playing' || !state.active) return state
  const moved = { ...state.active, x: state.active.x + dx }
  return fits(state.board, moved) ? shifted(state, moved) : state
}

export function rotate(state: GameState, clockwise: boolean): GameState {
  if (state.status !== 'playing' || !state.active) return state
  const piece = state.active
  const rotation = ((piece.rotation + (clockwise ? 1 : 3)) % 4) as Rotation
  for (const kick of kicksFor(piece.type, piece.rotation, clockwise)) {
    const candidate = { ...piece, rotation, x: piece.x + kick.x, y: piece.y + kick.y }
    if (fits(state.board, candidate)) return shifted(state, candidate)
  }
  return state
}

export function softDrop(state: GameState): GameState {
  if (state.status !== 'playing' || !state.active) return state
  const moved = { ...state.active, y: state.active.y + 1 }
  if (!fits(state.board, moved)) return state
  return { ...state, active: moved, score: state.score + SOFT_DROP_POINTS, gravityMs: 0 }
}

export function hardDrop(state: GameState): GameState {
  if (state.status !== 'playing' || !state.active) return state
  const y = ghostY(state.board, state.active)
  return lock({
    ...state,
    active: { ...state.active, y },
    score: state.score + HARD_DROP_POINTS * (y - state.active.y),
  })
}

export function holdPiece(state: GameState): GameState {
  if (state.status !== 'playing' || !state.active || state.holdUsed) return state
  const swappedOut = state.active.type
  const next = state.hold === null
    ? spawnNext({ ...state, active: null })
    : spawnPiece({ ...state, active: null }, state.hold)
  return { ...next, hold: swappedOut, holdUsed: true }
}

/** Advances gravity and lock delay by `dtMs` milliseconds. */
export function tick(state: GameState, dtMs: number): GameState {
  if (state.status !== 'playing' || !state.active) return state

  const interval = gravityIntervalMs(state.level)
  let piece = state.active
  let gravityMs = state.gravityMs + dtMs
  while (gravityMs >= interval) {
    const below = { ...piece, y: piece.y + 1 }
    if (!fits(state.board, below)) break
    piece = below
    gravityMs -= interval
  }

  const grounded = !fits(state.board, { ...piece, y: piece.y + 1 })
  if (!grounded) {
    return { ...state, active: piece, gravityMs, lockMs: null }
  }

  // First grounded tick: if the piece fell this tick it has rested for the unspent gravity
  // remainder; if it was moved onto a ledge between ticks, for at most this frame.
  const lockMs = state.lockMs === null ? Math.min(gravityMs, dtMs) : state.lockMs + dtMs
  if (lockMs >= LOCK_DELAY_MS) {
    return lock({ ...state, active: piece })
  }
  return { ...state, active: piece, gravityMs: 0, lockMs }
}
