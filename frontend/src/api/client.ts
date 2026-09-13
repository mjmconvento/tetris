// Thin fetch wrapper for the same-origin JSON API (proxied to Symfony by Vite/nginx).

export interface User {
  readonly id: number
  readonly username: string
}

export interface LeaderboardEntry {
  /** Game id — the stable key; a player may hold several places. */
  readonly id: number
  readonly rank: number
  readonly username: string
  readonly points: number
  readonly lines: number
  readonly level: number
  readonly achievedAt: string
}

export interface ScoreSummary {
  readonly best: number | null
  readonly games: number
}

export interface RecordedScore {
  readonly id: number
  readonly points: number
  readonly lines: number
  readonly level: number
  readonly achievedAt: string
  /** Position on the public top list, or null when the game did not make it. */
  readonly rank: number | null
}

interface Problem {
  readonly title?: string
  readonly status?: number
  readonly detail?: string
  readonly violations?: readonly { propertyPath: string; title: string }[]
}

export class ApiError extends Error {
  readonly status: number
  /** Field-level validation messages, keyed by property path. */
  readonly violations: Readonly<Record<string, string>>

  constructor(status: number, problem: Problem | null) {
    super(problem?.detail || problem?.title || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    const violations: Record<string, string> = {}
    for (const v of problem?.violations ?? []) violations[v.propertyPath] ??= v.title
    this.violations = violations
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let problem: Problem | null = null
    try {
      problem = (await response.json()) as Problem
    } catch {
      // Non-JSON error body (e.g. a proxy error page): fall back to the status text.
    }
    throw new ApiError(response.status, problem)
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export const api = {
  me: () => request<User>('GET', '/api/auth/me'),
  login: (username: string, password: string) => request<User>('POST', '/api/auth/login', { username, password }),
  register: (username: string, password: string) => request<User>('POST', '/api/auth/register', { username, password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  topScores: () => request<{ leaderboard: LeaderboardEntry[] }>('GET', '/api/scores/top'),
  myScores: () => request<ScoreSummary>('GET', '/api/scores/me'),
  submitScore: (points: number, lines: number, level: number) =>
    request<RecordedScore>('POST', '/api/scores', { points, lines, level }),
}
