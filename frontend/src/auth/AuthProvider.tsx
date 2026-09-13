import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api, type User } from '../api/client'
import { AuthContext, type AuthValue } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined
    let failures = 0
    const check = () =>
      api
        .me()
        .then((u) => !cancelled && setUser(u))
        .catch((e: unknown) => {
          if (cancelled) return
          // Only a 401 is a definitive "not signed in". Anything else (proxy error page while the
          // API cold-starts, network blip) is treated as anonymous for now and asked again.
          setUser(null)
          if (e instanceof ApiError && e.status === 401) return
          retryTimer = setTimeout(check, Math.min(30_000, 2_000 * 2 ** failures++))
        })
    check()
    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const u = await api.login(username, password)
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    const u = await api.register(username, password)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const value = useMemo<AuthValue>(() => ({ user, login, register, logout }), [user, login, register, logout])
  return <AuthContext value={value}>{children}</AuthContext>
}
