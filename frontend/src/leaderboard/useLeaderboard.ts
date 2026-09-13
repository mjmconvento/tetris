import { useEffect, useState } from 'react'
import { api, type LeaderboardEntry } from '../api/client'

export type LiveStatus = 'connecting' | 'live' | 'offline'

const MERCURE_URL = '/.well-known/mercure?topic=leaderboard'
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 30_000

/**
 * Top list that stays current: loaded once over HTTP, then replaced wholesale by every
 * Mercure event the backend publishes when a game lands on the board.
 */
export function useLeaderboard() {
  const [entries, setEntries] = useState<readonly LeaderboardEntry[] | null>(null)
  const [live, setLive] = useState<LiveStatus>('connecting')

  useEffect(() => {
    let cancelled = false
    let source: EventSource | null = null
    let retryTimer: number | undefined
    let failures = 0

    const load = () =>
      api
        .topScores()
        .then((r) => !cancelled && setEntries(r.leaderboard))
        .catch(() => undefined)

    const connect = () => {
      source = new EventSource(MERCURE_URL)
      source.onopen = () => {
        failures = 0
        setLive('live')
        // Fresh load after every (re)connect fills whatever was missed while disconnected.
        load()
      }
      source.onmessage = (event: MessageEvent<string>) => {
        const data = JSON.parse(event.data) as { leaderboard?: LeaderboardEntry[] }
        if (data.leaderboard) setEntries(data.leaderboard)
      }
      source.onerror = () => {
        if (source?.readyState !== EventSource.CLOSED) {
          // Dropped stream: the browser reconnects on its own.
          setLive('connecting')
          return
        }
        // The browser gives up for good after a non-200 or non-event-stream reply — e.g. a
        // proxy error page while the API is cold-starting. Retry ourselves, backing off.
        setLive('offline')
        source.close()
        retryTimer = setTimeout(connect, Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** failures++))
      }
    }

    load()
    connect()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
      source?.close()
    }
  }, [])

  return { entries, live }
}
