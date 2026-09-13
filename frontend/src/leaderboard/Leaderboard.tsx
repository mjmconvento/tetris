import type { LeaderboardEntry } from '../api/client'
import type { LiveStatus } from './useLeaderboard'

interface Props {
  readonly entries: readonly LeaderboardEntry[] | null
  readonly live: LiveStatus
  readonly currentUsername: string | null
}

const LIVE_LABEL: Record<LiveStatus, string> = {
  connecting: 'connecting…',
  live: 'live',
  offline: 'offline',
}

export function Leaderboard({ entries, live, currentUsername }: Props) {
  return (
    <section className="panel leaderboard" aria-labelledby="leaderboard-title">
      <header className="panel-header">
        <h2 id="leaderboard-title">Top 10</h2>
        <span className={`live live-${live}`} title="Updates arrive over Server-Sent Events (Mercure)">
          {LIVE_LABEL[live]}
        </span>
      </header>

      {entries === null ? (
        <p className="muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="muted">No scores yet — be the first.</p>
      ) : (
        <ol className="leaderboard-list">
          {entries.map((e) => (
            // Keyed on the game: a new entry mounts fresh (and flashes); rows that merely shift rank keep their identity.
            <li key={e.id} className={e.username === currentUsername ? 'is-me' : undefined}>
              <span className="rank">{e.rank}</span>
              <span className="name" title={e.username}>
                {e.username}
              </span>
              <span className="points">{e.points.toLocaleString()}</span>
              <span className="meta">
                {e.lines} lines · L{e.level}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
