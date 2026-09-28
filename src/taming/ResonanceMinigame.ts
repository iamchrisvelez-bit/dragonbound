/**
 * The wild-dragon taming skill test (System B in
 * docs/design/crystal-and-taming-systems.md §4): approach is handled by
 * TamingController's proximity check before this even starts; this class
 * covers read -> match -> hold.
 *
 * - **Reading**: a short pause with no input, representing the device
 *   reading the dragon's resonance signature before the player has to
 *   reproduce it.
 * - **Matching**: a rhythm-tap skill test - chosen over the doc's other
 *   prototype option (drag-to-align a waveform) because this is a
 *   touch-first game and a continuous drag gesture reads worse on a phone
 *   than tap-on-beat (see §4's own note: "rhythm suits the platform").
 * - **Holding**: once matched, the player must hold the bond button through
 *   the dragon "testing" it, mirroring System A's patience mechanic in a
 *   smaller dose. Letting go before the hold completes fails it, but a
 *   grace window is given to *start* holding, since the button that opened
 *   this phase (mountToggle) isn't naturally still held by the time
 *   matching finishes a few seconds later.
 *
 * Difficulty (beat count, tap window, hold duration) is chosen by
 * TamingController based on the dragon's `wariness` - see Dragon.flee().
 */
export type ResonancePhase = 'reading' | 'matching' | 'holding' | 'succeeded' | 'failed';

export type BeatState = 'pending' | 'hit' | 'missed';

export interface ResonanceBeat {
  id: number;
  windowStart: number;
  windowDuration: number;
  state: BeatState;
}

const READ_DURATION = 1.1;
const BEAT_SPACING = 0.65;
const HOLD_GRACE_SECONDS = 2.5;

export class ResonanceMinigame {
  readonly beats: ResonanceBeat[];
  readonly holdDuration: number;
  phase: ResonancePhase = 'reading';

  private readTimer = READ_DURATION;
  private matchElapsed = 0;
  private hits = 0;

  private holdElapsed = 0;
  private holdEngaged = false;
  private holdGraceTimer = HOLD_GRACE_SECONDS;
  private destabilizeAt: number;
  private destabilizeFired = false;

  constructor(
    beatCount: number,
    private successRatioNeeded: number,
    windowDuration: number,
    holdDuration: number,
  ) {
    this.beats = Array.from({ length: beatCount }, (_, i) => ({
      id: i,
      windowStart: 0.5 + i * BEAT_SPACING,
      windowDuration,
      state: 'pending' as BeatState,
    }));
    this.holdDuration = holdDuration;
    // Somewhere in the back 40-70% of the hold, never right at the start or the very end.
    this.destabilizeAt = holdDuration * (0.4 + Math.random() * 0.3);
  }

  get matchProgress(): number {
    return this.beats.length > 0 ? (this.hits / this.beats.length) * 100 : 0;
  }

  get holdProgress(): number {
    return Math.min(100, (this.holdElapsed / this.holdDuration) * 100);
  }

  get isFinished(): boolean {
    return this.phase === 'succeeded' || this.phase === 'failed';
  }

  get succeeded(): boolean {
    return this.phase === 'succeeded';
  }

  /** True exactly once, the frame the mid-hold "the dragon reacts" beat fires - consume it to trigger a cosmetic flare/haptic. */
  consumeDestabilizeEvent(): boolean {
    if (this.phase !== 'holding' || this.destabilizeFired || this.holdElapsed < this.destabilizeAt) return false;
    this.destabilizeFired = true;
    return true;
  }

  update(dt: number, holdInputHeld: boolean): void {
    switch (this.phase) {
      case 'reading':
        this.readTimer -= dt;
        if (this.readTimer <= 0) this.phase = 'matching';
        break;

      case 'matching': {
        this.matchElapsed += dt;
        for (const b of this.beats) {
          if (b.state === 'pending' && this.matchElapsed > b.windowStart + b.windowDuration) b.state = 'missed';
        }
        const last = this.beats[this.beats.length - 1];
        if (this.matchElapsed >= last.windowStart + last.windowDuration + 0.3) {
          for (const b of this.beats) if (b.state === 'pending') b.state = 'missed';
          this.phase = this.hits / this.beats.length >= this.successRatioNeeded ? 'holding' : 'failed';
        }
        break;
      }

      case 'holding':
        if (holdInputHeld) {
          this.holdEngaged = true;
          this.holdElapsed += dt;
          if (this.holdElapsed >= this.holdDuration) this.phase = 'succeeded';
        } else if (this.holdEngaged) {
          // let go mid-hold - the dragon's test wasn't sustained through
          this.phase = 'failed';
        } else {
          // hasn't started holding yet; a short grace window before this counts as a whiff
          this.holdGraceTimer -= dt;
          if (this.holdGraceTimer <= 0) this.phase = 'failed';
        }
        break;
    }
  }

  /** Call when the player taps the beat button during 'matching'. */
  registerTap(): boolean {
    if (this.phase !== 'matching') return false;
    const active = this.beats.find(
      (b) => b.state === 'pending' && this.matchElapsed >= b.windowStart && this.matchElapsed <= b.windowStart + b.windowDuration,
    );
    if (!active) return false;
    active.state = 'hit';
    this.hits++;
    return true;
  }
}
