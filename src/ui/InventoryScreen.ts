import { skillTreeData, type SkillBranch, type SkillNode } from '../progression/SkillTree';
import { progressionManager } from '../progression/ProgressionManager';
import { playerStable } from '../taming/PlayerStable';
import type { GearSlot, RolledGearItem } from '../progression/Gear';
import type { SavedStabledDragon } from '../core/SaveManager';

let stylesInjected = false;

const GEAR_SLOTS: GearSlot[] = ['weapon', 'helm', 'chest', 'gloves', 'boots', 'trinket'];
const WHEEL_SIZE = 220;
const WHEEL_RADIUS = 78;
const HUB_RADIUS = 30;
const NODE_SIZE = 56;

/**
 * Full-screen overlay listing the skill tree (3 branches, read from the
 * data model directly - no hardcoded node UI) as a radial "wheel" per
 * branch, plus a paper-doll equipment row and a gear inventory that
 * supports both tap-to-equip and pointer-drag-to-equip. Toggled by a
 * HUD/menu button; entirely DOM-based so it doesn't need to touch the
 * Three.js scene.
 */
export class InventoryScreen {
  readonly root: HTMLDivElement;
  private open = false;
  private dragGhost: HTMLDivElement | null = null;

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

    this.root.appendChild(this.renderStableSection());
    this.root.appendChild(this.renderSkillSection());
    this.root.appendChild(this.renderEquipmentSection());
    this.root.appendChild(this.renderGearSection());
  }

  // ---- Stable (tamed + crystalborn dragons) --------------------------------

  private renderStableSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'db-inv-section';
    const heading = document.createElement('h2');
    heading.textContent = 'Stable';
    section.appendChild(heading);

    const dragons = playerStable.list();
    if (dragons.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'db-branch-desc';
      empty.textContent = 'No dragons yet. Tame a wild one, or attune a sealed crystal.';
      section.appendChild(empty);
      return section;
    }

    const grid = document.createElement('div');
    grid.className = 'db-stable-grid';
    for (const dragon of dragons) grid.appendChild(this.renderStableCard(dragon));
    section.appendChild(grid);
    return section;
  }

  private renderStableCard(dragon: SavedStabledDragon): HTMLElement {
    const card = document.createElement('div');
    card.className = `db-stable-card db-origin-${dragon.origin}`;

    const name = document.createElement('strong');
    name.textContent = dragon.name;
    card.appendChild(name);

    const badge = document.createElement('span');
    badge.className = 'db-origin-badge';
    badge.textContent = originLabel(dragon.origin);
    card.appendChild(badge);

    const level = document.createElement('em');
    level.textContent = `Level ${dragon.level}`;
    card.appendChild(level);

    if (dragon.origin === 'tamed') {
      const loyaltyTrack = document.createElement('div');
      loyaltyTrack.className = 'db-loyalty-track';
      const loyaltyFill = document.createElement('div');
      loyaltyFill.className = 'db-loyalty-fill';
      loyaltyFill.style.width = `${Math.max(0, Math.min(100, dragon.loyalty))}%`;
      loyaltyTrack.appendChild(loyaltyFill);
      card.appendChild(loyaltyTrack);
      const loyaltyLabel = document.createElement('span');
      loyaltyLabel.className = 'db-loyalty-label';
      loyaltyLabel.textContent = `Loyalty ${Math.round(dragon.loyalty)}`;
      card.appendChild(loyaltyLabel);
    }

    return card;
  }

  // ---- Skill tree (radial wheel per branch) --------------------------------

  private renderSkillSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'db-inv-section';
    const heading = document.createElement('h2');
    heading.textContent = 'Skill Tree';
    section.appendChild(heading);

    const stack = document.createElement('div');
    stack.className = 'db-wheel-stack';
    for (const branch of skillTreeData) stack.appendChild(this.renderBranchWheel(branch));
    section.appendChild(stack);
    return section;
  }

  private renderBranchWheel(branch: SkillBranch): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'db-branch-wheel-wrap';

    const title = document.createElement('h3');
    title.textContent = branch.name;
    wrap.appendChild(title);
    const desc = document.createElement('p');
    desc.className = 'db-branch-desc';
    desc.textContent = branch.description;
    wrap.appendChild(desc);

    const wheel = document.createElement('div');
    wheel.className = 'db-wheel';
    wheel.style.width = `${WHEEL_SIZE}px`;
    wheel.style.height = `${WHEEL_SIZE}px`;

    const center = WHEEL_SIZE / 2;
    const positions = new Map<string, { x: number; y: number }>();
    branch.nodes.forEach((node, i) => {
      const angle = (i / branch.nodes.length) * Math.PI * 2 - Math.PI / 2;
      positions.set(node.id, { x: center + Math.cos(angle) * WHEEL_RADIUS, y: center + Math.sin(angle) * WHEEL_RADIUS });
    });

    // Connector lines (behind the nodes), drawn from each node to its prerequisites.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'db-wheel-lines');
    svg.setAttribute('width', String(WHEEL_SIZE));
    svg.setAttribute('height', String(WHEEL_SIZE));
    for (const node of branch.nodes) {
      const to = positions.get(node.id)!;
      for (const reqId of node.requires) {
        const from = positions.get(reqId);
        if (!from) continue;
        const unlocked = progressionManager.unlockedIds.includes(node.id);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(from.x));
        line.setAttribute('y1', String(from.y));
        line.setAttribute('x2', String(to.x));
        line.setAttribute('y2', String(to.y));
        line.setAttribute('class', unlocked ? 'db-wheel-line-unlocked' : 'db-wheel-line-locked');
        svg.appendChild(line);
      }
    }
    wheel.appendChild(svg);

    // Hub (branch icon/initial at the center).
    const hub = document.createElement('div');
    hub.className = 'db-wheel-hub';
    hub.style.width = `${HUB_RADIUS * 2}px`;
    hub.style.height = `${HUB_RADIUS * 2}px`;
    hub.style.left = `${center}px`;
    hub.style.top = `${center}px`;
    hub.textContent = branch.name.charAt(0);
    wheel.appendChild(hub);

    for (const node of branch.nodes) {
      const pos = positions.get(node.id)!;
      wheel.appendChild(this.renderSkillNodeButton(node, pos));
    }

    wrap.appendChild(wheel);
    return wrap;
  }

  private renderSkillNodeButton(node: SkillNode, pos: { x: number; y: number }): HTMLElement {
    const unlocked = progressionManager.unlockedIds.includes(node.id);
    const canUnlock = progressionManager.canUnlock(node.id);

    const btn = document.createElement('button');
    btn.className = 'db-wheel-node';
    if (unlocked) btn.classList.add('db-unlocked');
    else if (!canUnlock) btn.classList.add('db-locked');
    btn.style.width = `${NODE_SIZE}px`;
    btn.style.height = `${NODE_SIZE}px`;
    btn.style.left = `${pos.x}px`;
    btn.style.top = `${pos.y}px`;
    btn.disabled = unlocked || !canUnlock;
    btn.innerHTML = `<strong>${node.name}</strong><em>${unlocked ? '✓' : node.cost}</em>`;
    btn.title = `${node.name}\n${node.description}\n${unlocked ? 'Unlocked' : `Cost: ${node.cost}`}`;
    btn.addEventListener('click', () => {
      if (progressionManager.unlockNode(node.id)) this.render();
    });
    return btn;
  }

  // ---- Equipment paper-doll --------------------------------------------------

  private renderEquipmentSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'db-inv-section';
    const heading = document.createElement('h2');
    heading.textContent = 'Equipped';
    section.appendChild(heading);

    const row = document.createElement('div');
    row.className = 'db-equip-row';
    for (const slot of GEAR_SLOTS) {
      const item = progressionManager.getEquipped(slot);
      const slotEl = document.createElement('div');
      slotEl.className = `db-equip-slot${item ? ' db-equip-filled' : ''}`;
      slotEl.dataset.slot = slot;
      slotEl.innerHTML = `<span class="db-equip-slot-label">${slot}</span><strong>${item ? item.name : 'Empty'}</strong>`;
      row.appendChild(slotEl);
    }
    section.appendChild(row);
    return section;
  }

  // ---- Gear inventory (tap or drag onto a slot above to equip) --------------

  private renderGearSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'db-inv-section';
    const heading = document.createElement('h2');
    heading.textContent = 'Gear';
    section.appendChild(heading);

    if (progressionManager.gearInventory.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'db-branch-desc';
      empty.textContent = 'No gear yet. Defeating and taming dragons will drop equipment.';
      section.appendChild(empty);
      return section;
    }

    const hint = document.createElement('p');
    hint.className = 'db-branch-desc';
    hint.textContent = 'Tap a piece to equip it, or drag it onto a slot above.';
    section.appendChild(hint);

    const gearGrid = document.createElement('div');
    gearGrid.className = 'db-gear-grid';
    for (const item of progressionManager.gearInventory) {
      const equipped = progressionManager.getEquipped(item.slot)?.instanceId === item.instanceId;
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
      this.makeDraggable(card, item);
      gearGrid.appendChild(card);
    }
    section.appendChild(gearGrid);
    return section;
  }

  private makeDraggable(card: HTMLButtonElement, item: RolledGearItem): void {
    card.addEventListener('pointerdown', (downEvent) => {
      if (card.disabled) return;
      downEvent.preventDefault();
      const startX = downEvent.clientX;
      const startY = downEvent.clientY;
      let dragging = false;

      const onMove = (moveEvent: PointerEvent): void => {
        if (!dragging) {
          // Small threshold so a plain tap still reaches the click handler instead of starting a drag.
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 6) return;
          dragging = true;
          this.dragGhost = card.cloneNode(true) as HTMLDivElement;
          this.dragGhost.className = 'db-drag-ghost';
          this.dragGhost.textContent = item.name;
          document.body.appendChild(this.dragGhost);
        }
        if (this.dragGhost) {
          this.dragGhost.style.left = `${moveEvent.clientX}px`;
          this.dragGhost.style.top = `${moveEvent.clientY}px`;
        }
        document.querySelectorAll('.db-equip-slot-hover').forEach((el) => el.classList.remove('db-equip-slot-hover'));
        const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const slotEl = under?.closest('[data-slot]') as HTMLElement | null;
        if (slotEl && slotEl.dataset.slot === item.slot) slotEl.classList.add('db-equip-slot-hover');
      };

      const onUp = (upEvent: PointerEvent): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        this.dragGhost?.remove();
        this.dragGhost = null;
        document.querySelectorAll('.db-equip-slot-hover').forEach((el) => el.classList.remove('db-equip-slot-hover'));
        if (!dragging) return;
        const under = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const slotEl = under?.closest('[data-slot]') as HTMLElement | null;
        if (slotEl && slotEl.dataset.slot === item.slot) {
          progressionManager.equip(item.instanceId);
          this.render();
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
}

function originLabel(origin: SavedStabledDragon['origin']): string {
  switch (origin) {
    case 'crystalborn-whole':
      return 'Crystalborn';
    case 'crystalborn-fractured':
      return 'Crystalborn (Fractured)';
    case 'tamed':
      return 'Tamed';
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
    .db-branch-desc { font-size: 12px; opacity: 0.75; margin-top: 0; }

    .db-wheel-stack { display: flex; flex-direction: column; align-items: center; gap: 20px; }
    .db-branch-wheel-wrap { display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 280px; }
    .db-branch-wheel-wrap h3 { margin-bottom: 2px; color: #d4a853; }
    .db-wheel { position: relative; margin-top: 10px; }
    .db-wheel-lines { position: absolute; top: 0; left: 0; pointer-events: none; }
    .db-wheel-line-locked { stroke: rgba(255,255,255,0.18); stroke-width: 2; }
    .db-wheel-line-unlocked { stroke: rgba(111, 191, 115, 0.6); stroke-width: 2.5; }
    .db-wheel-hub {
      position: absolute;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: rgba(212, 168, 83, 0.18);
      border: 1px solid rgba(212, 168, 83, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      color: #d4a853;
    }
    .db-wheel-node {
      position: absolute;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      text-align: center;
      background: rgba(255,255,255,0.08);
      border: 1.5px solid rgba(255,255,255,0.25);
      color: #f2e9d8;
      font-size: 9px;
      line-height: 1.15;
      padding: 4px;
      overflow: hidden;
    }
    .db-wheel-node strong { font-size: 9px; font-weight: 600; }
    .db-wheel-node em { font-style: normal; color: #d4a853; font-size: 10px; margin-top: 1px; }
    .db-wheel-node.db-unlocked { border-color: #6fbf73; background: rgba(111, 191, 115, 0.2); }
    .db-wheel-node.db-unlocked em { color: #6fbf73; }
    .db-wheel-node.db-locked { opacity: 0.4; }

    .db-stable-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .db-stable-card {
      display: flex;
      flex-direction: column;
      gap: 3px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 12px;
    }
    .db-stable-card strong { font-size: 13px; }
    .db-stable-card em { font-style: normal; opacity: 0.7; font-size: 11px; }
    .db-origin-badge {
      align-self: flex-start;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 6px;
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
    }
    .db-origin-crystalborn-whole { border-color: rgba(90, 169, 230, 0.55); background: rgba(90, 169, 230, 0.1); }
    .db-origin-crystalborn-whole .db-origin-badge { color: #5aa9e6; background: rgba(90, 169, 230, 0.18); }
    .db-origin-crystalborn-fractured { border-color: rgba(201, 92, 58, 0.5); background: rgba(201, 92, 58, 0.08); }
    .db-origin-crystalborn-fractured .db-origin-badge { color: #c95c3a; background: rgba(201, 92, 58, 0.18); }
    .db-origin-tamed .db-origin-badge { color: #6fbf73; background: rgba(111, 191, 115, 0.18); }
    .db-loyalty-track {
      height: 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.12);
      overflow: hidden;
      margin-top: 2px;
    }
    .db-loyalty-fill { height: 100%; background: linear-gradient(90deg, #6a4fa8, #d4a853); }
    .db-loyalty-label { font-size: 10px; opacity: 0.7; }

    .db-equip-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .db-equip-slot {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: rgba(255,255,255,0.05);
      border: 1px dashed rgba(255,255,255,0.25);
      border-radius: 6px;
      padding: 8px;
      font-size: 11px;
      min-height: 44px;
    }
    .db-equip-slot-label { text-transform: capitalize; opacity: 0.6; font-size: 10px; }
    .db-equip-filled { border-style: solid; border-color: rgba(212, 168, 83, 0.5); background: rgba(212, 168, 83, 0.1); }
    .db-equip-slot-hover { border-color: #6fbf73 !important; background: rgba(111, 191, 115, 0.2) !important; }

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
      touch-action: none;
      cursor: grab;
    }
    .db-gear-card span { opacity: 0.7; font-size: 11px; text-transform: capitalize; }
    .db-gear-card em { font-style: normal; font-size: 10px; opacity: 0.8; }
    .db-gear-card.db-equipped { border-color: #d4a853; background: rgba(212, 168, 83, 0.15); }
    .db-rarity-uncommon strong { color: #6fbf73; }
    .db-rarity-rare strong { color: #5aa9e6; }
    .db-rarity-epic strong { color: #b07ee0; }
    .db-rarity-legendary strong { color: #d4a853; }

    .db-drag-ghost {
      position: fixed;
      z-index: 100;
      transform: translate(-50%, -50%);
      pointer-events: none;
      background: rgba(212, 168, 83, 0.9);
      color: #0b0f1a;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }

    .db-hidden { display: none !important; }
  `;
  document.head.appendChild(style);
}
