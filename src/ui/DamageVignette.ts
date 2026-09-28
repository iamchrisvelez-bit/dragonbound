let stylesInjected = false;

/** Full-screen red edge-flash on taking damage - pairs with FloatingText's
 * number and CameraRig's shake as the third leg of "you just got hit"
 * feedback, readable even in a glance at the screen edges during a fight. */
export class DamageVignette {
  private el: HTMLDivElement;

  constructor() {
    injectStyles();
    this.el = document.createElement('div');
    this.el.className = 'db-damage-vignette';
    document.body.appendChild(this.el);
  }

  flash(): void {
    this.el.classList.remove('db-vignette-active');
    void this.el.offsetWidth; // force reflow so the animation restarts on rapid consecutive hits
    this.el.classList.add('db-vignette-active');
  }
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .db-damage-vignette {
      position: fixed;
      inset: 0;
      z-index: 17;
      pointer-events: none;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(210, 20, 20, 0.75) 100%);
      opacity: 0;
    }
    .db-damage-vignette.db-vignette-active {
      animation: db-vignette-pulse 0.5s ease-out;
    }
    @keyframes db-vignette-pulse {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}
