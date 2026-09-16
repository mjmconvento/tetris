import { useCallback, useEffect, useState } from 'react'
import type { GameStatus } from '../game/engine'
import { music } from './music'
import { sfx } from './sfx'

const STORAGE_KEY = 'tetris:sound'

/**
 * Runs the game's audio: the background music plays while a game is running and is silent
 * while muted, paused or over, every new game starting from the first bar. One mute covers
 * the music and the line-clear effects alike, and is remembered across visits.
 */
export function useAudio(status: GameStatus) {
  const [muted, setMuted] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'off'
    } catch {
      return false
    }
  })

  useEffect(() => {
    music.setEnabled(!muted)
    sfx.setEnabled(!muted)
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on')
    } catch {
      // Storage blocked: the toggle still works, it just won't be remembered.
    }
  }, [muted])

  useEffect(() => {
    // 'ready' and 'over' are the only states a game starts from, and the music is stopped in
    // both — rewinding here covers the Start button and the Enter key alike.
    if (status === 'ready' || status === 'over') music.rewind()
    music.setPlaying(status === 'playing')
  }, [status])

  useEffect(() => () => music.setPlaying(false), [])

  const toggleMuted = useCallback(() => setMuted((m) => !m), [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== 'KeyM') return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, a, dialog')) return
      e.preventDefault()
      toggleMuted()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleMuted])

  return { muted, toggleMuted }
}
