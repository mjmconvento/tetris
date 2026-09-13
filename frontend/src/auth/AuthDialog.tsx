import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, type User } from '../api/client'
import { useAuth } from './context'

type Mode = 'login' | 'register'

interface Props {
  readonly open: boolean
  /** Why the dialog was opened, shown above the form (e.g. "sign in to save your score"). */
  readonly reason?: string
  onClose(): void
  onAuthenticated(user: User): void
}

export function AuthDialog({ open, reason, onClose, onAuthenticated }: Props) {
  const auth = useAuth()
  const ref = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<Mode>('register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({})

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first focusable element (a tab button); the field is more useful.
      dialog.querySelector<HTMLInputElement>('input[name=username]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setFieldErrors({})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const user = mode === 'login' ? await auth.login(username, password) : await auth.register(username, password)
      // The dialog stays mounted: clear the form so a later sign-in starts fresh.
      setUsername('')
      setPassword('')
      onAuthenticated(user)
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.violations)
        if (Object.keys(err.violations).length === 0) setError(err.message)
      } else {
        setError('Network error — please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="auth-dialog" onClose={onClose}>
      <form onSubmit={submit} className="auth-form">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>
            Sign up
          </button>
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>
            Sign in
          </button>
        </div>

        {reason && <p className="reason">{reason}</p>}

        <label>
          Username
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={20}
            pattern="[A-Za-z0-9_]+"
            title="3–20 letters, digits or underscores"
          />
          {fieldErrors.username && <span className="field-error">{fieldErrors.username}</span>}
        </label>

        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
