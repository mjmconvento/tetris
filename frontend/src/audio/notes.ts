/** Note names — `A4`, `G#5` — to frequencies in equal temperament, A4 = 440 Hz. */

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export function frequency(name: string): number {
  const note = /^([A-G])(#?)([0-8])$/.exec(name)
  if (!note) throw new Error(`bad note "${name}"`)
  const midi = (Number(note[3]) + 1) * 12 + SEMITONES[note[1]] + (note[2] ? 1 : 0)
  return 440 * 2 ** ((midi - 69) / 12)
}
