/**
 * Minimal background-music player: loops through a shuffled playlist of
 * ambient tracks, advancing to the next one whenever the current one ends.
 * No mixing/crossfade/ducking - this is ambience, not a full audio engine
 * (there's no SFX system in this game yet either).
 *
 * Browsers refuse to play audio before the page has seen a real user
 * gesture (pointerdown/click/keydown), so `start()` must be called from
 * one - see GameManager's one-time first-input listener.
 */
export class AudioManager {
  private audio = new Audio();
  private playlist: string[];
  private index = 0;
  private started = false;
  muted = false;

  constructor(trackNames: string[], private volume = 0.35) {
    this.playlist = shuffle([...trackNames]);
    this.audio.loop = false; // advance to the next track instead of repeating the same one forever
    this.audio.volume = volume;
    this.audio.addEventListener('ended', this.playNext);
  }

  /** Call once, from within a real user-gesture event handler. Safe to call repeatedly - only the first call does anything. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.playCurrent();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.audio.muted = this.muted;
    return this.muted;
  }

  private playCurrent(): void {
    this.audio.src = `${import.meta.env.BASE_URL}assets/audio/music/${this.playlist[this.index]}.ogg`;
    this.audio.muted = this.muted;
    // Playback can still be rejected in rare cases (tab backgrounded mid-call,
    // etc.) even after a real gesture unlocked audio - not worth surfacing.
    void this.audio.play().catch(() => {});
  }

  private playNext = (): void => {
    this.index = (this.index + 1) % this.playlist.length;
    this.playCurrent();
  };
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
