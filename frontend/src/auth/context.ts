import { createContext, useContext } from 'react'
import type { User } from '../api/client'

export interface AuthValue {
  /** undefined while the initial session check is in flight. */
  readonly user: User | null | undefined
  login(username: string, password: string): Promise<User>
  register(username: string, password: string): Promise<User>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
