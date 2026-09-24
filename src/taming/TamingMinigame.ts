/**
 * Stub taming minigame: a timed tap sequence. Once a dragon's HP drops
 * below its tame threshold, DragonAI flips to 'wary' and the player can
 * trigger this minigame. Each prompt opens a short hit-window; tapping the
 * attack/interact button while a window is open counts as a hit. Meeting
 * the success ratio flags the dragon tamed.
 *
 * This is intentionally minimal (no rhythm curves, no difficulty scaling)
 * so it's easy to swap for a richer minigame later without touching
 * DragonAI or PlayerStable.
 */
export type TapPromptState = 'pending' | 'hit' | 'missed';

export interface TapPrompt {
  id: number;
  windowStart: number;
  windowDuration: number;
  state: TapPromptState;
}

export class TamingMinigame {
  readonly prompts: TapPrompt[];
  private elapsed = 0;
  private finished = false;
  private hits = 0;

  constructor(
    promptCount: number = 6,
    private successRatioNeeded: number = 0.6,
    /** Scales each prompt's hit window (Bond branch's "Wyrmspeaker" skill widens this). */
    windowDurationMultiplier: number = 1,
  ) {
    const windowDuration = 0.35 * windowDurationMultiplier;
    this.prompts = Array.from({ length: promptCount }, (_, i) => ({
      id: i,
      windowStart: 0.6 + i * 0.75,
      windowDuration,
      state: 'pending' as TapPromptState,
    }));
  }

  get totalDuration(): number {
    const last = this.prompts[this.prompts.length - 1];
    return last.windowStart + last.windowDuration + 0.3;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  get succeeded(): boolean {
    return this.finished && this.hits / this.prompts.length >= this.successRatioNeeded;
  }

  get bondProgress(): number {
    // 0-100, used to drive BondMeter while the minigame is in progress
    return (this.hits / this.prompts.length) * 100;
  }

  update(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    for (const p of this.prompts) {
      if (p.state === 'pending' && this.elapsed > p.windowStart + p.windowDuration) {
        p.state = 'missed';
      }
    }
    if (this.elapsed >= this.totalDuration) this.finish();
  }

  /** Call when the player taps the prompt button (e.g. attack/interact). */
  registerTap(): boolean {
    if (this.finished) return false;
    const active = this.prompts.find(
      (p) => p.state === 'pending' && this.elapsed >= p.windowStart && this.elapsed <= p.windowStart + p.windowDuration,
    );
    if (!active) return false;
    active.state = 'hit';
    this.hits++;
    return true;
  }

  private finish(): void {
    this.finished = true;
    for (const p of this.prompts) if (p.state === 'pending') p.state = 'missed';
  }
}
