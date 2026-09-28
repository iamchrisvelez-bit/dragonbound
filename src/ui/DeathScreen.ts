let stylesInjected = false;

/** Full-screen "you have fallen" overlay shown while the knight is dead and
 * respawning - previously death was silent (health bar hits zero, screen
 * keeps rendering the corpse for RESPAWN_DELAY_SECONDS with no explanation),
 * which reads as the game hanging rather than as an intentional beat. */
export class DeathScreen {
  private root: HTMLDivElement;
  private countdownEl: HTMLDivElement;

  constructor() {
    injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'db-death-screen db-hidden';
    document.body.appendChild(this.root);

    const title = document.createElement('div');
    title.className = 'db-death-title';
    title.textContent = 'You Have Fallen';
    this.root.appendChild(title);

    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'db-death-countdown';
    this.root.appendChild(this.countdownEl);
  }

  /** secondsRemaining <= 0 (or the knight being alive) hides the overlay. */
  update(alive: boolean, secondsRemaining: number): void {
    if (alive || secondsRemaining <= 0) {
      this.root.classList.add('db-hidden');
      return;
    }
    this.root.classList.remove('db-hidden');
    this.countdownEl.textContent = `Returning in ${Math.ceil(secondsRemaining)}...`;
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-death-screen {
      position: fixed;
      inset: 0;
      z-index: 40;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: radial-gradient(ellipse at center, rgba(80, 10, 10, 0.35) 0%, rgba(6, 4, 8, 0.82) 75%);
      pointer-events: none;
      font-family: system-ui, sans-serif;
      color: #f2e9d8;
      animation: db-death-fade-in 0.6s ease;
    }
    .db-death-screen.db-hidden { display: none; }
    .db-death-title {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #e0554a;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
    }
    .db-death-countdown {
      font-size: 14px;
      opacity: 0.75;
      letter-spacing: 0.03em;
    }
    @keyframes db-death-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
