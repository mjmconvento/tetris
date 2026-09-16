import { describe, expect, it } from 'vitest'
import { clearSound } from './sfx'

const ROWS = [1, 2, 3, 4]

describe('the line-clear effect', () => {
  it('gets longer and higher with every extra row', () => {
    const sounds = ROWS.map((rows) => clearSound(rows))
    for (let i = 1; i < sounds.length; i += 1) {
      const top = (s: (typeof sounds)[number]) => Math.max(...s.notes.map((n) => n.freq))
      expect(sounds[i].notes.length).toBeGreaterThan(sounds[i - 1].notes.length)
      expect(sounds[i].seconds).toBeGreaterThan(sounds[i - 1].seconds)
      expect(top(sounds[i])).toBeGreaterThan(top(sounds[i - 1]))
    }
  })

  it('folds counts past a tetris into the tetris', () => {
    // Two pieces can lock inside one frame, so the game loop may report more than four rows.
    expect(clearSound(9)).toEqual(clearSound(4))
    expect(clearSound(0)).toEqual(clearSound(1))
  })

  it('reports a length that covers every note it schedules', () => {
    // `seconds` is how long the audio clock is held awake: a note ringing past it is cut off.
    for (const rows of ROWS) {
      const sound = clearSound(rows)
      expect(sound.seconds).toBeGreaterThanOrEqual(sound.sweep)
      for (const note of sound.notes) expect(note.at + note.duration).toBeLessThanOrEqual(sound.seconds)
    }
  })
})
