import { describe, expect, it } from 'vitest'
import {
  COLS,
  HIDDEN_ROWS,
  LOCK_DELAY_MS,
  ROWS,
  cellsOf,
  createGame,
  hardDrop,
  holdPiece,
  levelFor,
  moveHorizontal,
  rotate,
  softDrop,
  start,
  tick,
  type ActivePiece,
  type Board,
  type Cell,
  type GameState,
} from './engine'
import { nextBag, createRng } from './rng'
import { PIECE_TYPES, type PieceType } from './tetrominoes'

function boardWith(rows: Record<number, string>): Board {
  const board: Cell[][] = Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null))
  for (const [y, pattern] of Object.entries(rows)) {
    for (let x = 0; x < COLS; x++) board[Number(y)][x] = pattern[x] === '#' ? 'O' : null
  }
  return board
}

function playing(overrides: Partial<GameState>): GameState {
  return { ...start(createGame(1)), ...overrides }
}

const bottom = ROWS - 1

describe('7-bag randomizer', () => {
  it('deals every tetromino exactly once per bag, deterministically for a seed', () => {
    const [bag, next] = nextBag(createRng(42))
    expect([...bag].sort()).toEqual([...PIECE_TYPES].sort())
    expect(nextBag(createRng(42))[0]).toEqual(bag)
    expect(nextBag(next)[0]).not.toEqual(bag) // consecutive bags are (practically) never identical
  })
})

describe('line clears and scoring', () => {
  it('clears a full row, shifts the stack down and awards level-scaled points', () => {
    // Row `bottom` is full except columns 3..6; the row above holds a single marker cell.
    const board = boardWith({ [bottom]: '###....###', [bottom - 1]: '#.........' })
    const s = playing({ board, active: { type: 'I', rotation: 0, x: 3, y: 5 }, level: 2, score: 0, lines: 0 })

    const after = hardDrop(s)

    expect(after.lines).toBe(1)
    // Single-line clear: 100 x level 2, plus hard drop bonus: 2 points per row fallen.
    const rowsFallen = bottom - 1 - 5 // I piece cells sit one row below its box origin
    expect(after.score).toBe(100 * 2 + 2 * rowsFallen)
    expect(after.board[bottom]).toEqual(['O', null, null, null, null, null, null, null, null, null])
    expect(after.board[bottom - 1].every((c) => c === null)).toBe(true)
  })

  it('scores a Tetris as 800 x level and levels up every 10 lines', () => {
    const rows: Record<number, string> = {}
    for (let y = bottom; y > bottom - 4; y--) rows[y] = '###.######' // column 3 open in four rows
    const s = playing({ board: boardWith(rows), active: { type: 'I', rotation: 1, x: 1, y: 2 }, lines: 9, level: 1, score: 0 })

    const after = hardDrop(s)

    expect(after.lines).toBe(13)
    expect(after.level).toBe(2)
    expect(after.score - 2 * (bottom - 3 - 2)).toBe(800) // minus hard drop bonus, scored at the level before the clear
    expect(after.board.every((row) => row.every((c) => c === null))).toBe(true)
  })

  it('derives level from lines', () => {
    expect(levelFor(0)).toBe(1)
    expect(levelFor(9)).toBe(1)
    expect(levelFor(10)).toBe(2)
    expect(levelFor(25)).toBe(3)
  })
})

describe('SRS rotation', () => {
  it('kicks a T piece off the left wall instead of refusing the rotation', () => {
    // T in state R (pointing right) flush against the left wall: the R -> 2 rotation
    // would put a cell at x = -1, so SRS must apply the (+1, 0) kick.
    const s = playing({ board: boardWith({}), active: { type: 'T', rotation: 1, x: -1, y: 5 } })
    expect(cellsOf(s.active as ActivePiece).every((c) => c.x >= 0)).toBe(true)

    const after = rotate(s, true)

    expect(after.active?.rotation).toBe(2)
    expect(after.active?.x).toBe(0)
    expect(cellsOf(after.active as ActivePiece).every((c) => c.x >= 0 && c.x < COLS)).toBe(true)
  })

  it('leaves the piece untouched when no kick fits', () => {
    // Box the I piece in a 1-wide vertical shaft so it cannot become horizontal.
    const rows: Record<number, string> = {}
    for (let y = 0; y < ROWS; y++) rows[y] = '####.#####'
    const s = playing({ board: boardWith(rows), active: { type: 'I', rotation: 1, x: 2, y: 10 } })

    expect(rotate(s, true)).toBe(s)
    expect(rotate(s, false)).toBe(s)
  })
})

describe('movement and hold', () => {
  it('stops at the walls', () => {
    let s = playing({ board: boardWith({}), active: { type: 'O', rotation: 0, x: 3, y: 5 } })
    for (let i = 0; i < 20; i++) s = moveHorizontal(s, 1)
    expect(Math.max(...cellsOf(s.active as ActivePiece).map((c) => c.x))).toBe(COLS - 1)
    for (let i = 0; i < 20; i++) s = moveHorizontal(s, -1)
    expect(Math.min(...cellsOf(s.active as ActivePiece).map((c) => c.x))).toBe(0)
  })

  it('swaps the active piece into hold once per piece', () => {
    const s = playing({ board: boardWith({}), active: { type: 'T', rotation: 0, x: 3, y: 5 }, hold: null, holdUsed: false })
    const held = holdPiece(s)
    expect(held.hold).toBe('T')
    expect(held.active?.type).toBe(s.queue[0])
    expect(held.holdUsed).toBe(true)
    expect(holdPiece(held)).toBe(held)

    const swapped = holdPiece({ ...held, holdUsed: false })
    expect(swapped.active?.type).toBe('T')
    expect(swapped.hold).toBe(held.active?.type)
  })

  it('awards one point per soft-dropped row and none when grounded', () => {
    const s = playing({ board: boardWith({}), active: { type: 'O', rotation: 0, x: 3, y: bottom - 2 }, score: 0 })
    const dropped = softDrop(s)
    expect(dropped.score).toBe(1)
    expect(softDrop(dropped)).toBe(dropped)
  })
})

describe('gravity and lock delay', () => {
  it('locks a grounded piece only after the lock delay elapses', () => {
    const s = playing({ board: boardWith({}), active: { type: 'O', rotation: 0, x: 3, y: bottom - 1 }, gravityMs: 0 })

    const resting = tick(s, LOCK_DELAY_MS - 1)
    expect(resting.board[bottom].every((c) => c === null)).toBe(true)
    expect(resting.lockMs).toBe(LOCK_DELAY_MS - 1)

    const locked = tick(resting, 1)
    expect(locked.board[bottom].filter((c) => c === 'O')).toHaveLength(2)
    expect(locked.active?.type).toBe(s.queue[0])
  })

  it('moving a landed piece resets the lock timer', () => {
    const s = playing({ board: boardWith({}), active: { type: 'O', rotation: 0, x: 3, y: bottom - 1 } })
    const resting = tick(s, LOCK_DELAY_MS - 1)
    const nudged = moveHorizontal(resting, 1)
    expect(nudged.lockMs).toBe(0)
    expect(tick(nudged, LOCK_DELAY_MS - 1).board[bottom].every((c) => c === null)).toBe(true)
  })

  it('falls one row per gravity interval and stops on the stack', () => {
    const s = playing({ board: boardWith({ [bottom]: '##########' }), active: { type: 'O', rotation: 0, x: 3, y: 1 }, level: 1 })
    const after = tick(s, 1000) // level 1 gravity: 1 row per second
    expect(after.active?.y).toBe(2)

    // 17 more seconds lands the O (box rows 0-1) right above the full row with nothing to spare.
    const settled = tick(after, 17_000)
    expect(settled.active?.y).toBe(bottom - 2)
    expect(settled.lockMs).toBe(0)
  })

  it('does not count fall time or idle gravity towards the lock delay', () => {
    // Airborne O (columns 3-4) with most of a gravity interval banked, then slid right so
    // column 5 rests on the ledge: the lock timer must start from this frame, not from 900ms.
    const board = boardWith({ [bottom]: '.....#####' })
    const airborne = playing({ board, active: { type: 'O', rotation: 0, x: 2, y: bottom - 2 }, gravityMs: 900, lockMs: null })
    const onLedge = moveHorizontal(airborne, 1)
    expect(onLedge.lockMs).toBeNull()

    const first = tick(onLedge, 16)
    expect(first.lockMs).toBe(16)
    expect(first.active?.type).toBe('O')
  })
})

describe('game over', () => {
  it('ends when the next piece cannot spawn (block out)', () => {
    // A deep shaft at column 3 that never completes a row (column 2 stays open), with the
    // spawn area in the hidden rows already occupied.
    const rows: Record<number, string> = {}
    for (let y = HIDDEN_ROWS; y < ROWS; y++) rows[y] = '##..######'
    rows[0] = '...####...'
    rows[1] = '...####...'
    const s = playing({ board: boardWith(rows), active: { type: 'I', rotation: 1, x: 1, y: 2 } })

    const after = hardDrop(s)

    expect(after.lines).toBe(0)
    expect(after.status).toBe('over')
  })

  it('ignores input once over', () => {
    const over = { ...playing({ board: boardWith({}) }), status: 'over' as const }
    expect(moveHorizontal(over, 1)).toBe(over)
    expect(hardDrop(over)).toBe(over)
    expect(tick(over, 1000)).toBe(over)
  })
})

describe('shapes', () => {
  it('every piece has four cells in every rotation', () => {
    const types: PieceType[] = [...PIECE_TYPES]
    for (const type of types) {
      for (const rotation of [0, 1, 2, 3] as const) {
        const cells = cellsOf({ type, rotation, x: 0, y: 0 })
        expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(4)
      }
    }
  })
})
