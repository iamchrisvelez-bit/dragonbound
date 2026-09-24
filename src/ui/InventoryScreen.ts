import { skillTreeData } from '../progression/SkillTree';
import { progressionManager } from '../progression/ProgressionManager';
import type { GearSlot } from '../progression/Gear';

let stylesInjected = false;

/**
 * Full-screen overlay listing the skill tree (3 branches, read from the
 * data model directly - no hardcoded node UI) and the gear inventory with
 * an equip action. Toggled by a HUD/menu button; entirely DOM-based so it
 * doesn't need to touch the Three.js scene.
 */
export class InventoryScreen {
  readonly root: HTMLDivElement;
  private open = false;

  constructor() {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-inventory db-hidden';
    document.body.appendChild(this.root);
  }

  toggle(): void {
    this.open = !this.open;
    this.root.classList.toggle('db-hidden', !this.open);
    if (this.open) this.render();
  }

  get isOpen(): boolean {
    return this.open;
  }

  private render(): void {
    this.root.innerHTML = '';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'db-inv-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.toggle());
    this.root.appendChild(closeBtn);

    const points = document.createElement('div');
    points.className = 'db-inv-points';
    points.textContent = `Skill Points: ${progressionManager.skillPoints}`;
    this.root.appendChild(points);

    const skillSection = document.createElement('div');
    skillSection.className = 'db-inv-section';
    const skillHeading = document.createElement('h2');
    skillHeading.textContent = 'Skill Tree';
    skillSection.appendChild(skillHeading);

    const branchRow = document.createElement('div');
    branchRow.className = 'db-branch-row';
    for (const branch of skillTreeData) {
      const branchEl = document.createElement('div');
      branchEl.className = 'db-branch';

      const title = document.createElement('h3');
      title.textContent = branch.name;
      branchEl.appendChild(title);

      const desc = document.createElement('p');
      desc.className = 'db-branch-desc';
      desc.textContent = branch.description;
      branchEl.appendChild(desc);

      for (const node of branch.nodes) {
        const unlocked = progressionManager.unlockedIds.includes(node.id);
        const canUnlock = progressionManager.canUnlock(node.id);

        const nodeEl = document.createElement('button');
        nodeEl.className = 'db-skill-node';
        if (unlocked) nodeEl.classList.add('db-unlocked');
        else if (!canUnlock) nodeEl.classList.add('db-locked');
        nodeEl.disabled = unlocked || !canUnlock;
        nodeEl.innerHTML = `<strong>${node.name}</strong><span>${node.description}</span><em>${unlocked ? 'Unlocked' : `Cost: ${node.cost}`}</em>`;
        nodeEl.addEventListener('click', () => {
          if (progressionManager.unlockNode(node.id)) this.render();
        });
        branchEl.appendChild(nodeEl);
      }

      branchRow.appendChild(branchEl);
    }
    skillSection.appendChild(branchRow);
    this.root.appendChild(skillSection);

    const gearSection = document.createElement('div');
    gearSection.className = 'db-inv-section';
    const gearHeading = document.createElement('h2');
    gearHeading.textContent = 'Gear';
    gearSection.appendChild(gearHeading);

    if (progressionManager.gearInventory.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'db-branch-desc';
      empty.textContent = 'No gear yet. Defeating and taming dragons will drop equipment.';
      gearSection.appendChild(empty);
    } else {
      const gearGrid = document.createElement('div');
      gearGrid.className = 'db-gear-grid';
      for (const item of progressionManager.gearInventory) {
        const equipped = progressionManager.getEquipped(item.slot as GearSlot)?.instanceId === item.instanceId;
        const card = document.createElement('button');
        card.className = `db-gear-card db-rarity-${item.rarity}`;
        if (equipped) card.classList.add('db-equipped');
        const stats = Object.entries(item.rolledStats)
          .map(([k, v]) => `${k} +${v}`)
          .join(', ');
        card.innerHTML = `<strong>${item.name}</strong><span>${item.slot}</span><em>${stats}</em>`;
        card.disabled = equipped;
        card.addEventListener('click', () => {
          progressionManager.equip(item.instanceId);
          this.render();
        });
        gearGrid.appendChild(card);
      }
      gearSection.appendChild(gearGrid);
    }
    this.root.appendChild(gearSection);
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-inventory {
      position: fixed;
      inset: 0;
      z-index: 40;
      background: rgba(8, 10, 16, 0.94);
      color: #f2e9d8;
      font-family: system-ui, sans-serif;
      overflow-y: auto;
      padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px));
    }
    .db-inv-close {
      position: sticky;
      top: 0;
      float: right;
      background: rgba(201, 92, 58, 0.85);
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 13px;
    }
    .db-inv-points { font-size: 14px; margin: 8px 0 16px; color: #d4a853; }
    .db-inv-section { clear: both; margin-bottom: 24px; }
    .db-inv-section h2 { font-size: 16px; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 6px; }
    .db-branch-row { display: flex; flex-wrap: wrap; gap: 16px; }
    .db-branch { flex: 1 1 220px; min-width: 200px; }
    .db-branch h3 { margin-bottom: 2px; color: #d4a853; }
    .db-branch-desc { font-size: 12px; opacity: 0.75; margin-top: 0; }
    .db-skill-node {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      width: 100%;
      text-align: left;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 6px;
      color: #f2e9d8;
      font-size: 12px;
    }
    .db-skill-node span { opacity: 0.75; font-size: 11px; }
    .db-skill-node em { font-style: normal; color: #d4a853; font-size: 11px; }
    .db-skill-node.db-unlocked { border-color: #6fbf73; background: rgba(111, 191, 115, 0.15); }
    .db-skill-node.db-locked { opacity: 0.45; }
    .db-gear-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
    .db-gear-card {
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-align: left;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 8px 10px;
      color: #f2e9d8;
      font-size: 12px;
    }
    .db-gear-card span { opacity: 0.7; font-size: 11px; text-transform: capitalize; }
    .db-gear-card em { font-style: normal; font-size: 10px; opacity: 0.8; }
    .db-gear-card.db-equipped { border-color: #d4a853; background: rgba(212, 168, 83, 0.15); }
    .db-rarity-uncommon strong { color: #6fbf73; }
    .db-rarity-rare strong { color: #5aa9e6; }
    .db-rarity-epic strong { color: #b07ee0; }
    .db-rarity-legendary strong { color: #d4a853; }
    .db-hidden { display: none !important; }
  `;
  document.head.appendChild(style);
}
