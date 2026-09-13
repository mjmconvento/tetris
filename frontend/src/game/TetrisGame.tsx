import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { PREVIEW_COUNT } from './engine'
import { BOARD_HEIGHT, BOARD_WIDTH, PREVIEW_ROW_HEIGHT, PREVIEW_WIDTH, useTetris, type GameResult } from './useTetris'

interface Props {
  onGameOver(result: GameResult): void
  /** Pauses a running game (e.g. while a dialog is open). */
  readonly suspended: boolean
  /** Rendered inside the game-over overlay, under the final score. */
  readonly gameOverExtra?: ReactNode
}

const CONTROLS: readonly (readonly [string, string])[] = [
  ['← →', 'move'],
  ['↓', 'soft drop'],
  ['space', 'hard drop'],
  ['↑ / X', 'rotate'],
  ['Z', 'rotate back'],
  ['C / shift', 'hold'],
  ['P / esc', 'pause'],
]

export function TetrisGame({ onGameOver, suspended, gameOverExtra }: Props) {
  const boardRef = useRef<HTMLCanvasElement>(null)
  const queueRef = useRef<HTMLCanvasElement>(null)
  const holdRef = useRef<HTMLCanvasElement>(null)
  const canvases = useMemo(() => ({ board: boardRef, queue: queueRef, hold: holdRef }), [])
  const { hud, startGame, pause, resume } = useTetris(canvases, onGameOver)

  useEffect(() => {
    if (suspended) pause()
  }, [suspended, pause])

  return (
    <div className="game">
      <aside className="panel side">
        <h3>Hold</h3>
        <canvas ref={holdRef} width={PREVIEW_WIDTH} height={PREVIEW_ROW_HEIGHT} />
      </aside>

      <div className="board-wrap" style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}>
        <canvas ref={boardRef} width={BOARD_WIDTH} height={BOARD_HEIGHT} className="board" aria-label="Tetris board" />

        {hud.status !== 'playing' && (
          <div className="overlay">
            {hud.status === 'ready' && (
              <>
                <h2>Tetris</h2>
                <p className="muted">Clear lines, climb the board.</p>
                <button type="button" autoFocus onClick={(e) => (e.currentTarget.blur(), startGame())}>
                  Start <kbd>enter</kbd>
                </button>
              </>
            )}
            {hud.status === 'paused' && (
              <>
                <h2>Paused</h2>
                <button type="button" onClick={(e) => (e.currentTarget.blur(), resume())}>
                  Resume <kbd>P</kbd>
                </button>
              </>
            )}
            {hud.status === 'over' && (
              <>
                <h2>Game over</h2>
                <p className="final-score">{hud.score.toLocaleString()}</p>
                <p className="muted">
                  {hud.lines} lines · level {hud.level}
                </p>
                {gameOverExtra}
                <button type="button" onClick={(e) => (e.currentTarget.blur(), startGame())}>
                  Play again <kbd>enter</kbd>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <aside className="panel side">
        <h3>Next</h3>
        <canvas ref={queueRef} width={PREVIEW_WIDTH} height={PREVIEW_ROW_HEIGHT * PREVIEW_COUNT} />

        <dl className="stats">
          <dt>Score</dt>
          <dd>{hud.score.toLocaleString()}</dd>
          <dt>Lines</dt>
          <dd>{hud.lines}</dd>
          <dt>Level</dt>
          <dd>{hud.level}</dd>
        </dl>

        <ul className="controls">
          {CONTROLS.map(([key, what]) => (
            <li key={key}>
              <kbd>{key}</kbd> {what}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
