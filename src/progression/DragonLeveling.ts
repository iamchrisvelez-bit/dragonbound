import type { DragonOrigin } from '../core/SaveManager';

/**
 * XP curve and per-level stats for tamed dragons. A tamed dragon earns XP
 * from combat/quests after joining the stable; leveling it up scales its
 * combat stats via `statsForLevel`.
 */
const BASE_XP_TO_NEXT = 50;
const XP_GROWTH = 1.35;

export function xpRequiredForLevel(level: number): number {
  return Math.round(BASE_XP_TO_NEXT * Math.pow(XP_GROWTH, level - 1));
}

export function statsForLevel(level: number): { maxHealth: number; attackDamage: number } {
  return {
    maxHealth: 80 + (level - 1) * 12,
    attackDamage: 6 + (level - 1) * 1.5,
  };
}

/**
 * The crystalborn/tamed asymmetry from docs/design/crystal-and-taming-systems.md
 * §5: crystalborn dragons get a fixed stat ceiling set the moment the
 * crystal opened (full if it evaporated, a permanently reduced "scar" if it
 * fractured); tamed dragons instead get a `loyalty` value (0-100) that can
 * rise or fall with how they're treated, and scales their ceiling instead.
 *
 * Multiplies over `statsForLevel(level)`. Not yet wired into a live Dragon's
 * actual combat stats - nothing in this codebase currently re-applies stable
 * stats onto a ridden/summoned Dragon entity (dragon leveling/XP is itself
 * still unused scaffolding, see PlayerStable.addXp), so this is the formula
 * ready for that wiring rather than an effect you'll see in combat today.
 */
export function originStatMultiplier(dragon: { origin: DragonOrigin; loyalty: number }): number {
  switch (dragon.origin) {
    case 'crystalborn-whole':
      return 1.25;
    case 'crystalborn-fractured':
      return 0.85;
    case 'tamed':
    default: {
      const loyalty = Math.max(0, Math.min(100, dragon.loyalty));
      return 0.85 + (loyalty / 100) * 0.3; // 0.85 (neglected) - 1.15 (well-loved)
    }
  }
}

export interface XpApplyResult {
  level: number;
  xp: number;
  leveledUp: boolean;
}

/** Applies XP gain, resolving one or more level-ups as needed. */
export function applyXp(current: { level: number; xp: number }, gained: number): XpApplyResult {
  let { level, xp } = current;
  xp += gained;
  let leveledUp = false;
  let needed = xpRequiredForLevel(level);
  while (xp >= needed) {
    xp -= needed;
    level += 1;
    leveledUp = true;
    needed = xpRequiredForLevel(level);
  }
  return { level, xp, leveledUp };
}
