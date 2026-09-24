/**
 * Stamina gate shared by attacks, dodges, and blocking. Every costed action
 * should go through `spend`/`drain` rather than mutating a raw number, so
 * the regen-delay rule stays in one place.
 */
export class StaminaPool {
  current: number;
  /** Set from ProgressionManager's modifiers (Ward branch's "Steady Breath" etc). */
  regenMultiplier = 1;
  private sinceLastSpend = Number.POSITIVE_INFINITY;

  constructor(
    public max: number = 100,
    private regenPerSecond: number = 18,
    private regenDelay: number = 0.6,
  ) {
    this.current = max;
  }

  canAfford(amount: number): boolean {
    return this.current >= amount;
  }

  /** Spend a one-shot cost (attack, dodge). Returns false and spends nothing if unaffordable. */
  spend(amount: number): boolean {
    if (!this.canAfford(amount)) return false;
    this.current = Math.max(0, this.current - amount);
    this.sinceLastSpend = 0;
    return true;
  }

  /** Continuous drain while an action is held (blocking). Returns false once empty. */
  drain(amountPerSecond: number, dt: number): boolean {
    if (this.current <= 0) return false;
    this.current = Math.max(0, this.current - amountPerSecond * dt);
    this.sinceLastSpend = 0;
    return true;
  }

  tick(dt: number): void {
    this.sinceLastSpend += dt;
    if (this.sinceLastSpend >= this.regenDelay && this.current < this.max) {
      this.current = Math.min(this.max, this.current + this.regenPerSecond * this.regenMultiplier * dt);
    }
  }

  get ratio(): number {
    return this.max > 0 ? this.current / this.max : 0;
  }
}
