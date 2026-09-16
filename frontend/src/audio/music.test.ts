import { describe, expect, it } from 'vitest'
import { LOOP, LOOP_SECONDS } from './music'

// Importing the module parses both tracks: an unknown note name, a bad duration or a
// melody and bass of different lengths throws before these assertions ever run.
describe('the music loop', () => {
  it('is 24 bars of 4/4 at 144 bpm', () => {
    expect(LOOP_SECONDS).toBeCloseTo((24 * 8 * 30) / 144, 6)
  })

  it('never lets a note run past the end of the loop', () => {
    for (const note of LOOP) expect(note.at + note.duration).toBeLessThanOrEqual(LOOP_SECONDS + 1e-6)
  })
})
