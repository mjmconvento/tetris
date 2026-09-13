import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import {
  COLS,
  PREVIEW_COUNT,
  VISIBLE_ROWS,
  createGame,
  hardDrop,
  holdPiece,
  moveHorizontal,
  rotate,
  softDrop,
  start,
  tick,
  togglePause,
  type GameState,
  type GameStatus,
} from './engine'
import {
  BOARD_CELL,
  PREVIEW_BOX_COLS,
  PREVIEW_BOX_ROWS,
  PREVIEW_CELL,
  drawBoard,
  drawHold,
  drawQueue,
  prepareCanvas,
} from './render'

/** Delayed auto shift: hold a direction this long before it starts repeating. */
const DAS_MS = 167
/** Auto repeat rate while a direction is held. */
const ARR_MS = 33
const SOFT_DROP_MS = 45
/** Skip physics for hidden-tab gaps instead of fast-forwarding the game. */
const MAX_FRAME_MS = 100

export interface GameResult {
  readonly points: number
  readonly lines: number
  readonly level: number
}

/** The slice of game state React renders as text; everything else goes straight to canvas. */
export interface Hud {
  readonly score: number
  readonly lines: number
  readonly level: number
  readonly status: GameStatus
}

interface Canvases {
  board: RefObject<HTMLCanvasElement | null>
  queue: RefObject<HTMLCanvasElement | null>
  hold: RefObject<HTMLCanvasElement | null>
}

interface InputState {
  left: boolean
  right: boolean
  /** Direction currently auto-repeating: the most recently pressed one. */
  dir: -1 | 0 | 1
  dirHeldMs: number
  arrMs: number
  soft: boolean
  softMs: number
}

function hudOf(s: GameState): Hud {
  return { score: s.score, lines: s.lines, level: s.level, status: s.status }
}

function sameHud(a: Hud, b: Hud): boolean {
  return a.score === b.score && a.lines === b.lines && a.level === b.level && a.status === b.status
}

/** Keys the game owns; everything else is left to the browser. */
function actionFor(code: string): ((s: GameState) => GameState) | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyX':
      return (s) => rotate(s, true)
    case 'KeyZ':
    case 'ControlLeft':
    case 'ControlRight':
      return (s) => rotate(s, false)
    case 'Space':
      return hardDrop
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      return holdPiece
    case 'KeyP':
    case 'Escape':
      return togglePause
    default:
      return null
  }
}

export const BOARD_WIDTH = COLS * BOARD_CELL
export const BOARD_HEIGHT = VISIBLE_ROWS * BOARD_CELL
export const PREVIEW_WIDTH = PREVIEW_BOX_COLS * PREVIEW_CELL
export const PREVIEW_ROW_HEIGHT = PREVIEW_BOX_ROWS * PREVIEW_CELL

export function useTetris(canvases: Canvases, onGameOver: (result: GameResult) => void) {
  const [initial] = useState(() => createGame())
  const stateRef = useRef<GameState>(initial)
  const [hud, setHud] = useState<Hud>(() => hudOf(initial))
  const fireGameOver = useEffectEvent(onGameOver)

  const startGame = useCallback(() => {
    stateRef.current = start(stateRef.current)
  }, [])

  const pause = useCallback(() => {
    if (stateRef.current.status === 'playing') stateRef.current = togglePause(stateRef.current)
  }, [])

  const resume = useCallback(() => {
    if (stateRef.current.status === 'paused') stateRef.current = togglePause(stateRef.current)
  }, [])

  useEffect(() => {
    const input: InputState = { left: false, right: false, dir: 0, dirHeldMs: 0, arrMs: 0, soft: false, softMs: 0 }
    let lastHud = hudOf(stateRef.current)
    let lastDrawn: GameState | null = null
    let lastTime = performance.now()
    let frame = 0

    const setDirection = (dir: -1 | 0 | 1) => {
      input.dir = dir
      input.dirHeldMs = 0
      input.arrMs = 0
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, a, dialog')) return

      const s = stateRef.current
      switch (e.code) {
        case 'ArrowLeft':
          e.preventDefault()
          input.left = true
          setDirection(-1)
          stateRef.current = moveHorizontal(s, -1)
          return
        case 'ArrowRight':
          e.preventDefault()
          input.right = true
          setDirection(1)
          stateRef.current = moveHorizontal(s, 1)
          return
        case 'ArrowDown':
          e.preventDefault()
          input.soft = true
          input.softMs = 0
          stateRef.current = softDrop(s)
          return
        case 'Enter':
          if (s.status === 'ready' || s.status === 'over') {
            e.preventDefault()
            stateRef.current = start(s)
          }
          return
      }
      const action = actionFor(e.code)
      if (action) {
        e.preventDefault()
        stateRef.current = action(s)
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
          input.left = false
          if (input.dir === -1) setDirection(input.right ? 1 : 0)
          break
        case 'ArrowRight':
          input.right = false
          if (input.dir === 1) setDirection(input.left ? -1 : 0)
          break
        case 'ArrowDown':
          input.soft = false
          break
      }
    }

    const onVisibility = () => {
      if (document.hidden) pause()
    }

    const loop = (now: number) => {
      const dt = Math.min(now - lastTime, MAX_FRAME_MS)
      lastTime = now

      let s = stateRef.current
      if (s.status === 'playing') {
        if (input.dir !== 0) {
          input.dirHeldMs += dt
          if (input.dirHeldMs >= DAS_MS) {
            input.arrMs += dt
            while (input.arrMs >= ARR_MS) {
              s = moveHorizontal(s, input.dir)
              input.arrMs -= ARR_MS
            }
          }
        }
        if (input.soft) {
          input.softMs += dt
          while (input.softMs >= SOFT_DROP_MS) {
            s = softDrop(s)
            input.softMs -= SOFT_DROP_MS
          }
        }
        s = tick(s, dt)
      }
      stateRef.current = s

      if (s !== lastDrawn) {
        const board = canvases.board.current
        const queue = canvases.queue.current
        const hold = canvases.hold.current
        if (board) drawBoard(prepareCanvas(board, BOARD_WIDTH, BOARD_HEIGHT), s)
        if (queue) drawQueue(prepareCanvas(queue, PREVIEW_WIDTH, PREVIEW_ROW_HEIGHT * PREVIEW_COUNT), s.queue.slice(0, PREVIEW_COUNT))
        if (hold) drawHold(prepareCanvas(hold, PREVIEW_WIDTH, PREVIEW_ROW_HEIGHT), s.hold, s.holdUsed)
        lastDrawn = s

        const next = hudOf(s)
        if (!sameHud(next, lastHud)) {
          if (next.status === 'over' && lastHud.status !== 'over') {
            fireGameOver({ points: s.score, lines: s.lines, level: s.level })
          }
          lastHud = next
          setHud(next)
        }
      }

      frame = requestAnimationFrame(loop)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onVisibility)
    frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [canvases.board, canvases.queue, canvases.hold, pause])

  return { hud, startGame, pause, resume }
}
