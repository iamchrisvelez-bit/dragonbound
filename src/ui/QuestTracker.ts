import type { QuestLog, Quest } from '../world/QuestLog';
import { eventBus } from '../core/EventBus';

let stylesInjected = false;

/** Small always-on HUD panel tracking the current quest, backed directly by QuestLog. */
export class QuestTracker {
  readonly root: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private descEl: HTMLDivElement;
  private statusEl: HTMLDivElement;

  constructor(private questLog: QuestLog) {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-quest-tracker';
    document.body.appendChild(this.root);

    const header = document.createElement('div');
    header.className = 'db-quest-header';
    header.textContent = 'Quest';
    this.root.appendChild(header);

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'db-quest-title';
    this.root.appendChild(this.titleEl);

    this.descEl = document.createElement('div');
    this.descEl.className = 'db-quest-desc';
    this.root.appendChild(this.descEl);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'db-quest-status';
    this.root.appendChild(this.statusEl);

    eventBus.on('quest:updated', () => this.refresh());
    this.refresh();
  }

  private refresh(): void {
    const quest: Quest | undefined = this.questLog.list()[0];
    if (!quest) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;
    this.titleEl.textContent = quest.title;
    this.descEl.textContent = quest.description;
    this.statusEl.textContent = statusLabel(quest.status);
    this.statusEl.className = `db-quest-status db-quest-status-${quest.status}`;
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
