/**
 * Tracks how bonded the player currently is with a dragon mid-taming.
 * Fills from successful taps in the TamingMinigame; slowly decays if the
 * player stalls, so the minigame can't be left half-finished indefinitely.
 */
export class BondMeter {
  value = 0; // 0-100

  constructor(private decayPerSecond: number = 2) {}

  increase(amount: number): void {
    this.value = clamp(this.value + amount, 0, 100);
  }

  decay(dt: number): void {
    this.value = clamp(this.value - this.decayPerSecond * dt, 0, 100);
  }

  reset(): void {
    this.value = 0;
  }

  get isFull(): boolean {
    return this.value >= 100;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
