/**
 * Data-driven dragon attack patterns, mirroring how the player's combo
 * chain works (src/combat/ComboSystem.ts): tuning numbers live here, not
 * scattered through Dragon's state machine. Each pattern has a
 * windup -> active -> recovery lifecycle so attacks are telegraphed
 * (dragon holds still, its eyes flash the pattern's color) before they can
 * actually hit, giving the player a real read-and-react window instead of
 * an instant "gotcha" hit.
 */
export type DragonAttackType = 'lunge' | 'tailSweep' | 'breath';

export interface DragonAttackDef {
  type: DragonAttackType;
  name: string;
  /** Player-distance band this pattern can be picked from. */
  minRange: number;
  maxRange: number;
  /** Seconds before this exact pattern can be picked again. */
  cooldown: number;
  /** Seconds the dragon holds still and telegraphs before the hit goes live. */
  windup: number;
  /** Seconds the hitbox is actually live. */
  active: number;
  /** Seconds the dragon is vulnerable/idle after the attack before it can act again. */
  recovery: number;
  damage: number;
  radius: number;
  /** Movement/projectile speed; unused (0) for the stationary tailSweep. */
  speed: number;
  /** Eye-emissive color during windup, so different attacks read differently at a glance. */
  telegraphColor: number;
}

export const DRAGON_ATTACKS: DragonAttackDef[] = [
  {
    type: 'lunge',
    name: 'Bite Lunge',
    minRange: 1.8,
    maxRange: 4.5,
    cooldown: 3.2,
    windup: 0.35,
    active: 0.25,
    recovery: 0.5,
    damage: 12,
    radius: 1.1,
    speed: 8,
    telegraphColor: 0xd4a853,
  },
  {
    type: 'tailSweep',
    name: 'Tail Sweep',
    minRange: 0,
    maxRange: 2.4,
    cooldown: 5.0,
    windup: 0.45,
    active: 0.3,
    recovery: 0.7,
    damage: 16,
    radius: 2.6,
    speed: 0,
    telegraphColor: 0xc95c3a,
  },
  {
    type: 'breath',
    name: 'Ember Breath',
    minRange: 4,
    maxRange: 9,
    cooldown: 6.5,
    windup: 0.6,
    active: 1.0,
    recovery: 0.9,
    damage: 10,
    radius: 1.0,
    speed: 10,
    telegraphColor: 0xff5a2e,
  },
];

/** Largest maxRange across every pattern - the distance beyond which a dragon has nothing to do but close in. */
export const MAX_ENGAGE_RANGE = Math.max(...DRAGON_ATTACKS.map((a) => a.maxRange));

/** Patterns usable right now at this distance, given each pattern's remaining cooldown. */
export function eligibleAttacks(distance: number, cooldownRemaining: (name: string) => number): DragonAttackDef[] {
  return DRAGON_ATTACKS.filter(
    (a) => distance >= a.minRange && distance <= a.maxRange && cooldownRemaining(a.name) <= 0,
  );
}
