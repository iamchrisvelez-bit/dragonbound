/**
 * Short one-shot sound effects (attack swings, hits, dodges, UI taps) -
 * separate from AudioManager, which owns the single looping background music
 * track. Each play() spawns a fresh Audio instance rather than reusing one
 * per sound, since combat regularly needs the same sound to overlap itself
 * (e.g. two dragons taking hits back to back) - a shared element would cut
 * the previous playback off. Short clips make the extra instances cheap;
 * they're eligible for GC once playback ends and nothing references them.
 *
 * Exported as a singleton (like combatSystem/progressionManager) rather than
 * threaded through GameManager, so any gameplay module (Knight, Dragon,
 * TouchControls, ...) can call sfx.play(...) directly at the point the
 * sound actually happens, the same way they already reach eventBus/
 * combatSystem directly.
 */

const SFX_EXTENSION: Record<SfxName, 'ogg' | 'wav'> = {
  'attack-swing-1': 'ogg',
  'attack-swing-2': 'ogg',
  'hit-dragon': 'ogg',
  'hit-player': 'ogg',
  dodge: 'ogg',
  'dragon-windup': 'ogg',
  success: 'ogg',
  'ui-tap': 'wav',
};

export type SfxName =
  | 'attack-swing-1'
  | 'attack-swing-2'
  | 'hit-dragon'
  | 'hit-player'
  | 'dodge'
  | 'dragon-windup'
  | 'success'
  | 'ui-tap';

export class SfxManager {
  muted = false;
  volume = 0.7;

  play(name: SfxName, opts?: { volume?: number; rate?: number }): void {
    if (this.muted) return;
    const ext = SFX_EXTENSION[name];
    const audio = new Audio(`${import.meta.env.BASE_URL}assets/audio/sfx/${name}.${ext}`);
    audio.volume = Math.max(0, Math.min(1, this.volume * (opts?.volume ?? 1)));
    if (opts?.rate) audio.playbackRate = opts.rate;
    // Autoplay-policy rejections happen if this ever fires before the
    // page's first user gesture (StartScreen's "Begin" tap covers that in
    // practice) - swallow rather than surface as an unhandled rejection.
    void audio.play().catch(() => {});
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }
}

export const sfx = new SfxManager();
