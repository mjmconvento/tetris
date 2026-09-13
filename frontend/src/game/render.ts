import { COLS, HIDDEN_ROWS, VISIBLE_ROWS, cellsOf, ghostY, type GameState } from './engine'
import { COLORS, SHAPES, type PieceType } from './tetrominoes'

export const BOARD_CELL = 32
export const PREVIEW_CELL = 22

const BOARD_BG = '#0b0e14'
const GRID_LINE = 'rgba(255, 255, 255, 0.05)'

/** Makes a canvas crisp on high-DPI screens and returns a context scaled to CSS pixels. */
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas is not supported')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha = 1): void {
  const inset = Math.max(1, Math.floor(size * 0.06))
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(x + inset, y + inset, size - inset * 2, size - inset * 2)
  // Bevel: light top-left, dark bottom-right.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.fillRect(x + inset, y + inset, size - inset * 2, inset * 2)
  ctx.fillRect(x + inset, y + inset, inset * 2, size - inset * 2)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.fillRect(x + inset, y + size - inset * 3, size - inset * 2, inset * 2)
  ctx.fillRect(x + size - inset * 3, y + inset, inset * 2, size - inset * 2)
  ctx.globalAlpha = 1
}

export function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, cell: number = BOARD_CELL): void {
  const width = COLS * cell
  const height = VISIBLE_ROWS * cell
  ctx.fillStyle = BOARD_BG
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = GRID_LINE
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(x * cell + 0.5, 0)
    ctx.lineTo(x * cell + 0.5, height)
  }
  for (let y = 1; y < VISIBLE_ROWS; y++) {
    ctx.moveTo(0, y * cell + 0.5)
    ctx.lineTo(width, y * cell + 0.5)
  }
  ctx.stroke()

  for (let y = HIDDEN_ROWS; y < state.board.length; y++) {
    const row = state.board[y]
    for (let x = 0; x < COLS; x++) {
      const type = row[x]
      if (type) drawCell(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, COLORS[type], state.status === 'over' ? 0.45 : 1)
    }
  }

  const piece = state.active
  if (!piece) return

  if (state.status === 'playing') {
    const ghost = { ...piece, y: ghostY(state.board, piece) }
    if (ghost.y !== piece.y) {
      for (const c of cellsOf(ghost)) {
        if (c.y < HIDDEN_ROWS) continue
        ctx.globalAlpha = 0.22
        ctx.fillStyle = COLORS[piece.type]
        ctx.fillRect(c.x * cell + 2, (c.y - HIDDEN_ROWS) * cell + 2, cell - 4, cell - 4)
        ctx.globalAlpha = 1
      }
    }
  }

  for (const c of cellsOf(piece)) {
    if (c.y < HIDDEN_ROWS) continue
    drawCell(ctx, c.x * cell, (c.y - HIDDEN_ROWS) * cell, cell, COLORS[piece.type])
  }
}

/** Draws a piece in its spawn orientation centred in a box of `boxCols` x `boxRows` cells. */
function drawCentered(
  ctx: CanvasRenderingContext2D,
  type: PieceType,
  originX: number,
  originY: number,
  boxCols: number,
  boxRows: number,
  cell: number,
  alpha: number,
): void {
  const shape = SHAPES[type][0]
  const minX = Math.min(...shape.map((c) => c.x))
  const maxX = Math.max(...shape.map((c) => c.x))
  const minY = Math.min(...shape.map((c) => c.y))
  const maxY = Math.max(...shape.map((c) => c.y))
  const offsetX = originX + ((boxCols - (maxX - minX + 1)) * cell) / 2 - minX * cell
  const offsetY = originY + ((boxRows - (maxY - minY + 1)) * cell) / 2 - minY * cell
  for (const c of shape) {
    drawCell(ctx, offsetX + c.x * cell, offsetY + c.y * cell, cell, COLORS[type], alpha)
  }
}

export const PREVIEW_BOX_COLS = 4
export const PREVIEW_BOX_ROWS = 3

export function drawQueue(ctx: CanvasRenderingContext2D, queue: readonly PieceType[], cell: number = PREVIEW_CELL): void {
  ctx.clearRect(0, 0, PREVIEW_BOX_COLS * cell, PREVIEW_BOX_ROWS * cell * queue.length)
  queue.forEach((type, i) => {
    drawCentered(ctx, type, 0, i * PREVIEW_BOX_ROWS * cell, PREVIEW_BOX_COLS, PREVIEW_BOX_ROWS, cell, 1)
  })
}

export function drawHold(ctx: CanvasRenderingContext2D, type: PieceType | null, used: boolean, cell: number = PREVIEW_CELL): void {
  ctx.clearRect(0, 0, PREVIEW_BOX_COLS * cell, PREVIEW_BOX_ROWS * cell)
  if (type) drawCentered(ctx, type, 0, 0, PREVIEW_BOX_COLS, PREVIEW_BOX_ROWS, cell, used ? 0.35 : 1)
}
