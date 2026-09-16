/**
 * Background music: "Korobeiniki" (Russian folk tune, public domain) played by a two-voice
 * Web Audio synth. Synthesising it beats shipping an audio file — no licence to carry, no
 * download before the first note, and the loop is seamless by construction.
 *
 * Playback is governed by two switches: `enabled` (the mute toggle) and `playing` (a game
 * is running). Sound comes out only when both are on; otherwise the AudioContext is
 * suspended, which freezes its clock so the tune resumes exactly where it stopped.
 */

import { audioContext, heldSeconds } from './context'
import { frequency } from './notes'

/** The score's time unit is the eighth note; eight of them to a 4/4 bar. */
const TEMPO_BPM = 144
const EIGHTH_S = 30 / TEMPO_BPM
const MASTER_VOLUME = 0.32
/** How far ahead of the audio clock notes are queued, and how often the queue is topped up. */
const LOOKAHEAD_S = 0.3
const PUMP_MS = 60
/** Mute/unmute ramp: long enough to avoid a click, short enough to feel instant. */
const FADE_S = 0.06

// `note:eighths`, `-` is a rest.
const MELODY_A = [
  'E5:2 B4:1 C5:1 D5:2 C5:1 B4:1',
  'A4:2 A4:1 C5:1 E5:2 D5:1 C5:1',
  'B4:3 C5:1 D5:2 E5:2',
  'C5:2 A4:2 A4:2 -:2',
  'D5:3 F5:1 A5:2 G5:1 F5:1',
  'E5:3 C5:1 E5:2 D5:1 C5:1',
  'B4:3 C5:1 D5:2 E5:2',
  'C5:2 A4:2 A4:2 -:2',
].join(' ')

/** The slow half of the tune: two voices a third apart, in half notes. */
const MELODY_B = [
  'E5:4 C5:4',
  'D5:4 B4:4',
  'C5:4 A4:4',
  'G#4:4 B4:4',
  'E5:4 C5:4',
  'D5:4 B4:4',
  'C5:2 E5:2 A5:4',
  'G#5:4 -:4',
].join(' ')

/** Root and fifth of each chord the bass walks — no thirds, so the harmony is never wrong. */
const CHORDS: Record<string, readonly [string, string]> = {
  E: ['E2', 'B2'],
  A: ['A2', 'E3'],
  D: ['D2', 'A2'],
  G: ['G2', 'D3'],
}

/** One bar per chord, alternating root and fifth on the quarter note. */
function bassline(chords: string): string {
  return chords
    .split(' ')
    .map((name) => {
      const chord = CHORDS[name]
      if (!chord) throw new Error(`unknown chord "${name}"`)
      return `${chord[0]}:2 ${chord[1]}:2 ${chord[0]}:2 ${chord[1]}:2`
    })
    .join(' ')
}

// The loop: the fast half twice, then the slow half.
const MELODY = `${MELODY_A} ${MELODY_A} ${MELODY_B}`
const BASS = `${bassline('E A E A D A E A')} ${bassline('E A E A D A E A')} ${bassline('A G A E A G A E')}`

interface Note {
  /** Seconds from the top of the loop. */
  readonly at: number
  readonly freq: number
  readonly duration: number
  readonly wave: OscillatorType
  readonly peak: number
}

function track(score: string, wave: OscillatorType, peak: number): { notes: Note[]; seconds: number } {
  const notes: Note[] = []
  let at = 0
  for (const token of score.split(' ')) {
    const [name, eighths] = token.split(':')
    const beats = Number(eighths)
    if (!name || !Number.isFinite(beats) || beats <= 0) throw new Error(`bad token "${token}"`)
    const duration = beats * EIGHTH_S
    if (name !== '-') notes.push({ at, freq: frequency(name), duration, wave, peak })
    at += duration
  }
  return { notes, seconds: at }
}

const melody = track(MELODY, 'square', 0.16)
const bass = track(BASS, 'triangle', 0.22)
// Both tracks are scheduled against one clock, so a mis-edited bar would desync the loop
// for good. Fail at import instead — `music.test.ts` runs this on every build.
if (Math.abs(melody.seconds - bass.seconds) > 1e-6) {
  throw new Error(`melody (${melody.seconds}s) and bass (${bass.seconds}s) must be the same length`)
}

/** Every note of the loop, ordered by start time. */
export const LOOP: readonly Note[] = [...melody.notes, ...bass.notes].sort((a, b) => a.at - b.at)
export const LOOP_SECONDS = melody.seconds

/** Plucks one note: fast attack, small decay, fully released before the next one starts. */
function pluck(ctx: AudioContext, dest: AudioNode, note: Note, at: number): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = note.wave
  osc.frequency.value = note.freq

  const body = Math.max(note.duration - 0.04, 0.03)
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(note.peak, at + 0.01)
  gain.gain.linearRampToValueAtTime(note.peak * 0.7, at + Math.min(0.09, body))
  gain.gain.linearRampToValueAtTime(0, at + body)

  osc.connect(gain)
  gain.connect(dest)
  osc.start(at)
  osc.stop(at + body)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}

class Music {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private pump: number | null = null
  private idle: number | null = null
  /** Index into `LOOP` of the next note to queue, and the clock time of this pass's first note. */
  private cursor = 0
  private loopStart = 0
  private enabled = true
  private playing = false

  /** The mute toggle. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled
    this.sync()
  }

  /** Whether a game is running. */
  setPlaying(playing: boolean): void {
    if (playing === this.playing) return
    this.playing = playing
    this.sync()
  }

  /** Starts the next stretch of playback from the first bar. */
  rewind(): void {
    this.cursor = 0
    if (this.ctx) this.loopStart = this.ctx.currentTime
  }

  private sync(): void {
    if (this.enabled && this.playing) this.resume()
    else this.halt()
  }

  private resume(): void {
    const ctx = this.open()
    const master = this.master
    if (!ctx || !master) return
    if (this.idle !== null) {
      clearTimeout(this.idle)
      this.idle = null
    }
    // The first call happens inside a click, so the autoplay policy lets this through.
    void ctx.resume().catch(() => {})
    this.ramp(MASTER_VOLUME)
    if (this.pump === null) this.pump = window.setInterval(this.queue, PUMP_MS)
    this.queue()
  }

  private halt(): void {
    if (this.pump !== null) {
      clearInterval(this.pump)
      this.pump = null
    }
    const ctx = this.ctx
    if (!ctx || !this.master) return
    this.ramp(0)
    // Freeze the clock once the fade is out — but not while an effect is still ringing, or a
    // clear that ended the game would be chopped off mid-sound.
    const wait = Math.max(FADE_S + 0.04, heldSeconds())
    clearTimeout(this.idle ?? undefined)
    this.idle = window.setTimeout(() => {
      this.idle = null
      void ctx.suspend().catch(() => {})
    }, wait * 1000)
  }

  private ramp(to: number): void {
    const ctx = this.ctx
    const gain = this.master?.gain
    if (!ctx || !gain) return
    const now = ctx.currentTime
    // Read before cancelling: `value` is the level the running ramp has reached.
    const from = gain.value
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(from, now)
    gain.linearRampToValueAtTime(to, now + FADE_S)
  }

  private open(): AudioContext | null {
    if (this.ctx) return this.ctx
    const ctx = audioContext()
    if (!ctx) return null
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    this.ctx = ctx
    this.master = master
    this.loopStart = ctx.currentTime
    return ctx
  }

  private queue = (): void => {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const horizon = ctx.currentTime + LOOKAHEAD_S
    for (;;) {
      const note = LOOP[this.cursor]
      const at = this.loopStart + note.at
      if (at >= horizon) return
      // A throttled timer can leave the queue behind the clock; drop what it missed rather
      // than dumping a backlog of notes into the speakers at once.
      if (at >= ctx.currentTime) pluck(ctx, master, note, at)
      this.cursor += 1
      if (this.cursor === LOOP.length) {
        this.cursor = 0
        this.loopStart += LOOP_SECONDS
      }
    }
  }
}

export const music = new Music()
