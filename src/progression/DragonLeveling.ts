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
