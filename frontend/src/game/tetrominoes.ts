// Tetromino shapes and Super Rotation System (SRS) kick tables.
// Coordinates are screen-style: x grows right, y grows DOWN.

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Rotation = 0 | 1 | 2 | 3

export interface Point {
  readonly x: number
  readonly y: number
}

export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

const p = (x: number, y: number): Point => ({ x, y })

/**
 * Cells occupied by each piece in each rotation state, relative to the top-left of its
 * SRS bounding box (4x4 for I, 3x3 for the rest; O never moves).
 */
export const SHAPES: Readonly<Record<PieceType, readonly (readonly Point[])[]>> = {
  I: [
    [p(0, 1), p(1, 1), p(2, 1), p(3, 1)],
    [p(2, 0), p(2, 1), p(2, 2), p(2, 3)],
    [p(0, 2), p(1, 2), p(2, 2), p(3, 2)],
    [p(1, 0), p(1, 1), p(1, 2), p(1, 3)],
  ],
  O: [
    [p(1, 0), p(2, 0), p(1, 1), p(2, 1)],
    [p(1, 0), p(2, 0), p(1, 1), p(2, 1)],
    [p(1, 0), p(2, 0), p(1, 1), p(2, 1)],
    [p(1, 0), p(2, 0), p(1, 1), p(2, 1)],
  ],
  T: [
    [p(1, 0), p(0, 1), p(1, 1), p(2, 1)],
    [p(1, 0), p(1, 1), p(2, 1), p(1, 2)],
    [p(0, 1), p(1, 1), p(2, 1), p(1, 2)],
    [p(1, 0), p(0, 1), p(1, 1), p(1, 2)],
  ],
  S: [
    [p(1, 0), p(2, 0), p(0, 1), p(1, 1)],
    [p(1, 0), p(1, 1), p(2, 1), p(2, 2)],
    [p(1, 1), p(2, 1), p(0, 2), p(1, 2)],
    [p(0, 0), p(0, 1), p(1, 1), p(1, 2)],
  ],
  Z: [
    [p(0, 0), p(1, 0), p(1, 1), p(2, 1)],
    [p(2, 0), p(1, 1), p(2, 1), p(1, 2)],
    [p(0, 1), p(1, 1), p(1, 2), p(2, 2)],
    [p(1, 0), p(0, 1), p(1, 1), p(0, 2)],
  ],
  J: [
    [p(0, 0), p(0, 1), p(1, 1), p(2, 1)],
    [p(1, 0), p(2, 0), p(1, 1), p(1, 2)],
    [p(0, 1), p(1, 1), p(2, 1), p(2, 2)],
    [p(1, 0), p(1, 1), p(0, 2), p(1, 2)],
  ],
  L: [
    [p(2, 0), p(0, 1), p(1, 1), p(2, 1)],
    [p(1, 0), p(1, 1), p(1, 2), p(2, 2)],
    [p(0, 1), p(1, 1), p(2, 1), p(0, 2)],
    [p(0, 0), p(1, 0), p(1, 1), p(1, 2)],
  ],
}

export const COLORS: Readonly<Record<PieceType, string>> = {
  I: '#3fd8f5',
  O: '#f5d63f',
  T: '#c26bf5',
  S: '#5ce07a',
  Z: '#f56b6b',
  J: '#5c8df5',
  L: '#f5a24a',
}

/**
 * SRS wall kicks, indexed by [from rotation][clockwise ? 0 : 1]; each entry is the list
 * of offsets to try in order. Values are the guideline tables with y negated (y down).
 */
type KickTable = readonly (readonly (readonly Point[])[])[]

const JLSTZ_KICKS: KickTable = [
  // from 0
  [
    [p(0, 0), p(-1, 0), p(-1, -1), p(0, 2), p(-1, 2)], // 0 -> R
    [p(0, 0), p(1, 0), p(1, -1), p(0, 2), p(1, 2)], // 0 -> L
  ],
  // from R
  [
    [p(0, 0), p(1, 0), p(1, 1), p(0, -2), p(1, -2)], // R -> 2
    [p(0, 0), p(1, 0), p(1, 1), p(0, -2), p(1, -2)], // R -> 0
  ],
  // from 2
  [
    [p(0, 0), p(1, 0), p(1, -1), p(0, 2), p(1, 2)], // 2 -> L
    [p(0, 0), p(-1, 0), p(-1, -1), p(0, 2), p(-1, 2)], // 2 -> R
  ],
  // from L
  [
    [p(0, 0), p(-1, 0), p(-1, 1), p(0, -2), p(-1, -2)], // L -> 0
    [p(0, 0), p(-1, 0), p(-1, 1), p(0, -2), p(-1, -2)], // L -> 2
  ],
]

const I_KICKS: KickTable = [
  [
    [p(0, 0), p(-2, 0), p(1, 0), p(-2, 1), p(1, -2)], // 0 -> R
    [p(0, 0), p(-1, 0), p(2, 0), p(-1, -2), p(2, 1)], // 0 -> L
  ],
  [
    [p(0, 0), p(-1, 0), p(2, 0), p(-1, -2), p(2, 1)], // R -> 2
    [p(0, 0), p(2, 0), p(-1, 0), p(2, -1), p(-1, 2)], // R -> 0
  ],
  [
    [p(0, 0), p(2, 0), p(-1, 0), p(2, -1), p(-1, 2)], // 2 -> L
    [p(0, 0), p(1, 0), p(-2, 0), p(1, 2), p(-2, -1)], // 2 -> R
  ],
  [
    [p(0, 0), p(1, 0), p(-2, 0), p(1, 2), p(-2, -1)], // L -> 0
    [p(0, 0), p(-2, 0), p(1, 0), p(-2, 1), p(1, -2)], // L -> 2
  ],
]

const NO_KICKS: readonly Point[] = [p(0, 0)]

export function kicksFor(type: PieceType, from: Rotation, clockwise: boolean): readonly Point[] {
  if (type === 'O') return NO_KICKS
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS
  return table[from][clockwise ? 0 : 1]
}
