/**
 * Line-clear sound effects, synthesised on the same context as the music: a filtered noise
 * sweep for the rows crumbling away, over a rising A-minor arpeggio that grows with the
 * number of rows — a single is a two-note ping, a tetris runs two octaves over a low body
 * note. The reward you hear scales with the reward you score.
 */

import { audioContext, holdUntil } from './context'
import { frequency } from './notes'

/** Effects sit above the music's 0.32 master so a clear cuts through the tune. */
const VOLUME = 0.55
/** Gap between arpeggio steps, and how long each one rings; steps overlap, so they chime. */
const STEP_S = 0.055
const RING_S = 0.22
/** The top note hangs on after the run. */
const TAIL_S = 0.6
const ATTACK_S = 0.006
/** Scheduling a hair ahead of the clock: an attack that starts in the past clicks. */
const LEAD_S = 0.01
const NOTE_PEAK = 0.2
const BODY_PEAK = 0.18

/** The crumble: band-passed white noise, sweeping up as the rows go. */
const NOISE_S = 1
const SWEEP_S = 0.16
const SWEEP_PER_ROW_S = 0.05
const SWEEP_FROM_HZ = 900
const SWEEP_TO_HZ = 5200
const SWEEP_PEAK = 0.22

/** One arpeggio per number of rows cleared; index `rows - 1`. */
const ARPEGGIOS: readonly string[] = ['E5 A5', 'A5 C6 E6', 'A5 C6 E6 A6', 'A5 C6 E6 A6 C7 E7']

export interface ClearNote {
  /** Seconds from the start of the effect. */
  readonly at: number
  readonly freq: number
  readonly duration: number
  readonly wave: OscillatorType
  readonly peak: number
}

export interface ClearSound {
  readonly notes: readonly ClearNote[]
  /** Length of the noise sweep that opens the effect. */
  readonly sweep: number
  /** Length of the whole effect, tail included. */
  readonly seconds: number
}

/**
 * The effect for `rows` cleared rows. Four rows is the most the rules can clear at once, but
 * two pieces can lock inside one frame, so anything larger folds into the tetris.
 */
export function clearSound(rows: number): ClearSound {
  const size = Math.min(Math.max(rows, 1), ARPEGGIOS.length)
  const names = ARPEGGIOS[size - 1].split(' ')
  const notes: ClearNote[] = names.map((name, i) => ({
    at: i * STEP_S,
    freq: frequency(name),
    duration: i === names.length - 1 ? TAIL_S : RING_S,
    wave: 'square',
    peak: NOTE_PEAK,
  }))
  // A tetris gets a low voice under the run — the weight is what makes it land as an event.
  if (size === ARPEGGIOS.length) {
    notes.push({ at: 0, freq: frequency('A3'), duration: TAIL_S, wave: 'triangle', peak: BODY_PEAK })
  }

  const sweep = SWEEP_S + size * SWEEP_PER_ROW_S
  const seconds = notes.reduce((end, note) => Math.max(end, note.at + note.duration), sweep)
  return { notes, sweep, seconds }
}

/** Strikes one note: instant attack, bell-like decay, silent before the node is dropped. */
function ring(ctx: AudioContext, dest: AudioNode, note: ClearNote, at: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = note.wave
  osc.frequency.value = note.freq

  const end = at + note.duration
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(note.peak, at + ATTACK_S)
  // An exponential decay sounds struck rather than faded, but never reaches zero: cut it.
  gain.gain.exponentialRampToValueAtTime(note.peak * 0.001, end)
  gain.gain.setValueAtTime(0, end)

  osc.connect(gain)
  gain.connect(dest)
  osc.start(at)
  osc.stop(end)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}

/** The noise sweep: a narrow band of hiss climbing out of the board. */
function crumble(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, at: number, seconds: number): void {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = 0.9
  band.frequency.setValueAtTime(SWEEP_FROM_HZ, at)
  band.frequency.exponentialRampToValueAtTime(SWEEP_TO_HZ, at + seconds)

  const end = at + seconds
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(SWEEP_PEAK, at + ATTACK_S)
  gain.gain.exponentialRampToValueAtTime(SWEEP_PEAK * 0.001, end)
  gain.gain.setValueAtTime(0, end)

  src.connect(band)
  band.connect(gain)
  gain.connect(dest)
  src.start(at)
  src.stop(end)
  src.onended = () => {
    src.disconnect()
    band.disconnect()
    gain.disconnect()
  }
}

class Sfx {
  private out: GainNode | null = null
  private noise: AudioBuffer | null = null
  private enabled = true

  /** The mute toggle, shared with the music. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Plays the clear for `rows` rows, on the frame they go. An arrow so the game loop can hold
   * it as a callback. Muted, or in a browser without Web Audio, this is a no-op.
   */
  lineClear = (rows: number): void => {
    if (!this.enabled || rows < 1) return
    const ctx = audioContext()
    if (!ctx) return
    const out = this.open(ctx)

    const sound = clearSound(rows)
    const at = ctx.currentTime + LEAD_S
    crumble(ctx, out, this.noiseBuffer(ctx), at, sound.sweep)
    for (const note of sound.notes) ring(ctx, out, note, at + note.at)
    // Keep the clock awake: this clear may be the one that ended the game.
    holdUntil(at + sound.seconds)
  }

  private open(ctx: AudioContext): GainNode {
    if (this.out) return this.out
    const out = ctx.createGain()
    out.gain.value = VOLUME
    out.connect(ctx.destination)
    this.out = out
    return out
  }

  /** One second of white noise, generated once and re-read by every sweep. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * NOISE_S), ctx.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1
    this.noise = buffer
    return buffer
  }
}

export const sfx = new Sfx()
