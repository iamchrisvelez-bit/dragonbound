/**
 * Skill tree as pure data. Three branches (Blade / Ward / Bond), each a
 * short line of nodes with prerequisites. UI and gameplay both read this
 * structure rather than hardcoding node behavior, so growing the tree is
 * an edit here, not a code change elsewhere.
 */
export type SkillBranchId = 'blade' | 'ward' | 'bond';

export type SkillStat = 'attackDamage' | 'maxHealth' | 'maxStamina' | 'staminaRegen' | 'bondGainRate';

export type SkillEffect =
  | { type: 'stat'; stat: SkillStat; amount: number }
  | { type: 'unlock-ability'; abilityId: string };

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  /** Node ids that must already be unlocked before this one is available. */
  requires: string[];
  effect: SkillEffect;
}

export interface SkillBranch {
  id: SkillBranchId;
  name: string;
  description: string;
  nodes: SkillNode[];
}

export const skillTreeData: SkillBranch[] = [
  {
    id: 'blade',
    name: 'Blade',
    description: 'Offensive knight skills: damage, combos, finishers.',
    nodes: [
      {
        id: 'blade-1',
        name: 'Honed Edge',
        description: '+10% light attack damage.',
        cost: 1,
        requires: [],
        effect: { type: 'stat', stat: 'attackDamage', amount: 0.1 },
      },
      {
        id: 'blade-2',
        name: 'Swift Strikes',
        description: 'Shorter recovery between combo hits.',
        cost: 1,
        requires: ['blade-1'],
        effect: { type: 'stat', stat: 'attackDamage', amount: 0.05 },
      },
      {
        id: 'blade-3',
        name: 'Heavy Follow-Through',
        description: '+25% damage on the 3rd combo hit.',
        cost: 2,
        requires: ['blade-2'],
        effect: { type: 'stat', stat: 'attackDamage', amount: 0.25 },
      },
      {
        id: 'blade-4',
        name: 'Riposte',
        description: 'Unlocks a counter-attack after a perfectly timed block.',
        cost: 2,
        requires: ['blade-3'],
        effect: { type: 'unlock-ability', abilityId: 'riposte' },
      },
      {
        id: 'blade-5',
        name: "Dragonslayer's Fury",
        description: '+15% damage vs dragons above 50% HP.',
        cost: 3,
        requires: ['blade-4'],
        effect: { type: 'stat', stat: 'attackDamage', amount: 0.15 },
      },
    ],
  },
  {
    id: 'ward',
    name: 'Ward',
    description: 'Defensive knight skills: stamina, survivability, dodging.',
    nodes: [
      {
        id: 'ward-1',
        name: 'Iron Stance',
        description: '+15 max stamina.',
        cost: 1,
        requires: [],
        effect: { type: 'stat', stat: 'maxStamina', amount: 15 },
      },
      {
        id: 'ward-2',
        name: 'Steady Breath',
        description: '+20% stamina regen rate.',
        cost: 1,
        requires: ['ward-1'],
        effect: { type: 'stat', stat: 'staminaRegen', amount: 0.2 },
      },
      {
        id: 'ward-3',
        name: 'Battle Hardened',
        description: '+20 max health.',
        cost: 2,
        requires: ['ward-2'],
        effect: { type: 'stat', stat: 'maxHealth', amount: 20 },
      },
      {
        id: 'ward-4',
        name: 'Evasive Roll',
        description: 'Unlocks an extended-i-frame dodge roll.',
        cost: 2,
        requires: ['ward-3'],
        effect: { type: 'unlock-ability', abilityId: 'evasive-roll' },
      },
    ],
  },
  {
    id: 'bond',
    name: 'Bond',
    description: 'Taming and dragon-rider skills.',
    nodes: [
      {
        id: 'bond-1',
        name: 'Gentle Hand',
        description: '+15% bond gained per successful taming tap.',
        cost: 1,
        requires: [],
        effect: { type: 'stat', stat: 'bondGainRate', amount: 0.15 },
      },
      {
        id: 'bond-2',
        name: 'Calming Presence',
        description: 'Bond decays more slowly while taming.',
        cost: 1,
        requires: ['bond-1'],
        effect: { type: 'stat', stat: 'bondGainRate', amount: 0.1 },
      },
      {
        id: 'bond-3',
        name: 'Wyrmspeaker',
        description: 'Widens taming minigame tap windows.',
        cost: 2,
        requires: ['bond-2'],
        effect: { type: 'unlock-ability', abilityId: 'wide-tap-windows' },
      },
      {
        id: 'bond-4',
        name: 'Saddle-Ready',
        description: 'Unlocks mounting a dragon immediately after taming it.',
        cost: 2,
        requires: ['bond-3'],
        effect: { type: 'unlock-ability', abilityId: 'instant-mount' },
      },
      {
        id: 'bond-5',
        name: 'Skyfriend',
        description: '+20% tamed dragon XP gain.',
        cost: 3,
        requires: ['bond-4'],
        effect: { type: 'stat', stat: 'bondGainRate', amount: 0.2 },
      },
    ],
  },
];

export function findSkillNode(nodeId: string): SkillNode | undefined {
  for (const branch of skillTreeData) {
    const node = branch.nodes.find((n) => n.id === nodeId);
    if (node) return node;
  }
  return undefined;
}

export function canUnlockNode(nodeId: string, unlockedIds: readonly string[]): boolean {
  const node = findSkillNode(nodeId);
  if (!node) return false;
  if (unlockedIds.includes(nodeId)) return false;
  return node.requires.every((reqId) => unlockedIds.includes(reqId));
}
