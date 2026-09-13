import { useCallback, useEffect, useState } from 'react'
import { api, type ScoreSummary, type User } from './api/client'
import { AuthDialog } from './auth/AuthDialog'
import { useAuth } from './auth/context'
import { TetrisGame } from './game/TetrisGame'
import type { GameResult } from './game/useTetris'
import { Leaderboard } from './leaderboard/Leaderboard'
import { useLeaderboard } from './leaderboard/useLeaderboard'

/** What happened to the last finished game's score. */
type SaveState =
  | { readonly kind: 'none' }
  | { readonly kind: 'needs-auth'; readonly result: GameResult }
  | { readonly kind: 'saving'; readonly result: GameResult }
  | { readonly kind: 'saved'; readonly result: GameResult; readonly rank: number | null }
  | { readonly kind: 'error'; readonly result: GameResult; readonly message: string }

export default function App() {
  const auth = useAuth()
  const { entries, live } = useLeaderboard()
  const [authOpen, setAuthOpen] = useState(false)
  // Personal stats are tagged with their owner so a sign-out/sign-in never shows stale numbers.
  const [ownedSummary, setOwnedSummary] = useState<{ userId: number; summary: ScoreSummary } | null>(null)
  const summary = ownedSummary && ownedSummary.userId === auth.user?.id ? ownedSummary.summary : null
  const [save, setSave] = useState<SaveState>({ kind: 'none' })

  const userId = auth.user?.id
  useEffect(() => {
    if (userId === undefined) return
    let cancelled = false
    api
      .myScores()
      .then((s) => !cancelled && setOwnedSummary({ userId, summary: s }))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId])

  // Takes the user explicitly: right after signing in, `auth.user` in this closure is still stale.
  const submit = useCallback(async (result: GameResult, user: User) => {
    setSave({ kind: 'saving', result })
    try {
      const recorded = await api.submitScore(result.points, result.lines, result.level)
      setSave({ kind: 'saved', result, rank: recorded.rank })
      setOwnedSummary((prev) => {
        const s = prev?.userId === user.id ? prev.summary : null
        return { userId: user.id, summary: { best: Math.max(s?.best ?? 0, result.points), games: (s?.games ?? 0) + 1 } }
      })
    } catch (e) {
      setSave({ kind: 'error', result, message: e instanceof Error ? e.message : 'Could not save the score.' })
    }
  }, [])

  const onGameOver = useCallback(
    (result: GameResult) => {
      if (result.points === 0) {
        setSave({ kind: 'none' })
      } else if (auth.user) {
        void submit(result, auth.user)
      } else {
        // Keep the best unsaved game around until the player signs in.
        setSave((prev) => (prev.kind === 'needs-auth' && prev.result.points > result.points ? prev : { kind: 'needs-auth', result }))
      }
    },
    [auth.user, submit],
  )

  const onAuthenticated = useCallback(
    (user: User) => {
      setAuthOpen(false)
      if (save.kind === 'needs-auth') void submit(save.result, user)
    },
    [save, submit],
  )

  const signOut = async () => {
    await auth.logout()
    setSave({ kind: 'none' })
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>TETRIS</h1>
        <div className="account">
          {auth.user ? (
            <>
              <span className="who">
                @{auth.user.username}
                {summary?.best != null && <span className="muted"> · best {summary.best.toLocaleString()}</span>}
              </span>
              <button type="button" className="ghost" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : auth.user === null ? (
            <button type="button" onClick={() => setAuthOpen(true)}>
              Sign in / Sign up
            </button>
          ) : null}
        </div>
      </header>

      <main className="layout">
        <TetrisGame
          onGameOver={onGameOver}
          suspended={authOpen}
          gameOverExtra={
            <SaveStatus
              save={save}
              onSignIn={() => setAuthOpen(true)}
              onRetry={() => save.kind === 'error' && auth.user && submit(save.result, auth.user)}
            />
          }
        />
        <Leaderboard entries={entries} live={live} currentUsername={auth.user?.username ?? null} />
      </main>

      <AuthDialog
        open={authOpen}
        reason={save.kind === 'needs-auth' ? `Sign in to post your ${save.result.points.toLocaleString()} points to the leaderboard.` : undefined}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={onAuthenticated}
      />
    </div>
  )
}

function SaveStatus({ save, onSignIn, onRetry }: { save: SaveState; onSignIn(): void; onRetry(): void }) {
  switch (save.kind) {
    case 'none':
      return null
    case 'needs-auth':
      return (
        <p className="save-status">
          <button type="button" className="link" onClick={onSignIn}>
            Sign in to post this score
          </button>
        </p>
      )
    case 'saving':
      return <p className="save-status muted">Saving…</p>
    case 'saved':
      return (
        <p className="save-status">
          {save.rank !== null ? `On the board at #${save.rank}!` : 'Saved — not a top 10 (yet).'}
        </p>
      )
    case 'error':
      return (
        <p className="save-status error">
          {save.message}{' '}
          <button type="button" className="link" onClick={onRetry}>
            Retry
          </button>
        </p>
      )
  }
}
