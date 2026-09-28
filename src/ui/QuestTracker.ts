import type { QuestLog, Quest } from '../world/QuestLog';
import { eventBus } from '../core/EventBus';

let stylesInjected = false;

/** Small always-on HUD panel tracking quests, backed directly by QuestLog.
 * Shows every not-yet-complete quest as its own compact card (rather than
 * just the first one in the log) - with two independent starter quests now
 * live at once (tame a dragon / open a crystal), a single-quest tracker
 * would hide whichever one wasn't first in the list. */
export class QuestTracker {
  readonly root: HTMLDivElement;
  private list: HTMLDivElement;

  constructor(private questLog: QuestLog) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-quest-tracker';
    document.body.appendChild(this.root);

    const header = document.createElement('div');
    header.className = 'db-quest-header';
    header.textContent = 'Quests';
    this.root.appendChild(header);

    this.list = document.createElement('div');
    this.list.className = 'db-quest-list';
    this.root.appendChild(this.list);

    eventBus.on('quest:updated', () => this.refresh());
    this.refresh();
  }

  private refresh(): void {
    const quests = this.questLog.list().filter((q) => q.status !== 'complete');
    this.list.innerHTML = '';
    this.root.hidden = quests.length === 0;
    for (const quest of quests) this.list.appendChild(this.renderQuest(quest));
  }

  private renderQuest(quest: Quest): HTMLElement {
    const item = document.createElement('div');
    item.className = 'db-quest-item';

    const title = document.createElement('div');
    title.className = 'db-quest-title';
    title.textContent = quest.title;
    item.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'db-quest-desc';
    desc.textContent = quest.description;
    item.appendChild(desc);

    const status = document.createElement('div');
    status.className = `db-quest-status db-quest-status-${quest.status}`;
    status.textContent = statusLabel(quest.status);
    item.appendChild(status);

    return item;
  }
}

function statusLabel(status: Quest['status']): string {
  switch (status) {
    case 'not-started':
      return 'Not started';
    case 'active':
      return 'Active';
    case 'complete':
      return 'Complete';
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-quest-tracker {
      position: fixed;
      top: max(132px, calc(env(safe-area-inset-top, 0px) + 132px));
      right: max(14px, env(safe-area-inset-right, 0px));
      width: 170px;
      z-index: 15;
      pointer-events: none;
      font-family: system-ui, sans-serif;
      color: #f2e9d8;
      background: rgba(11, 15, 26, 0.6);
      border: 1px solid rgba(212, 168, 83, 0.4);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .db-quest-header {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.65;
      margin-bottom: 2px;
    }
    .db-quest-list { display: flex; flex-direction: column; gap: 8px; }
    .db-quest-item + .db-quest-item { padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.12); }
    .db-quest-title { font-size: 12px; font-weight: 600; color: #d4a853; }
    .db-quest-desc { font-size: 11px; opacity: 0.85; margin-top: 3px; line-height: 1.35; }
    .db-quest-status {
      margin-top: 5px;
      display: inline-block;
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
    }
    .db-quest-status-active { color: #d4a853; }
    .db-quest-status-complete { color: #6fbf73; }
    .db-quest-status-not-started { color: #9fb4d8; }
  `;
  document.head.appendChild(style);
}
