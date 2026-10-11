/** 🔒 [AUDIO SERVICE] Lightweight, crash-proof Web Audio API synth for micro-games. */

export type SoundEvent =
  | 'click'
  | 'select'
  | 'swap'
  | 'score'
  | 'reward'
  | 'explosion'
  | 'clear'
  | 'gameover'
  | 'error';

export class Audio {
  private static ctx: AudioContext | null = null;
  public static isMuted = false;

  /** Checks internal mute flag and YouTube host system audio status. */
  public static shouldMute(): boolean {
    if (this.isMuted) return true;
    if (typeof window !== 'undefined') {
      try {
        const yt = (window as any).ytgame;
        if (yt?.system?.isAudioEnabled && !yt.system.isAudioEnabled()) {
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  /**
   * Safe, lazy initialization of AudioContext on touch/click.
   */
  public static init() {
    if (this.shouldMute()) return;
    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as {webkitAudioContext: typeof AudioContext})
            .webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {
      // Ignore initialization errors to protect main game loop
    }
  }

  // --- Primitive Synth Engines ---

  private static playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    vol: number = 0.1,
    slideFreq?: number,
  ) {
    this.init();
    if (this.shouldMute() || !this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideFreq) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(slideFreq, 10),
          t + duration,
        );
      }

      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + duration);
    } catch (e) {
      // Fail silently if audio hardware drops
    }
  }

  private static playNoise(duration: number, vol: number) {
    this.init();
    if (this.shouldMute() || !this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, t);
      filter.frequency.exponentialRampToValueAtTime(100, t + duration);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(t);
    } catch (e) {}
  }

  // --- Universal Event API ---

  /**
   * Primary entry point for playing synthesized audio.
   * @param event Sound event tag
   * @param tier Pitch multiplier or cascade combo count
   */
  public static play(event: SoundEvent | string, tier: number = 1) {
    if (this.shouldMute()) return;

    switch (event) {
      case 'click':
        this.playTone(600, 'sine', 0.04, 0.12, 200);
        break;

      case 'select':
        this.playTone(800, 'sine', 0.05, 0.12, 960);
        break;

      case 'swap': {
        const variations = [440, 460, 480, 420, 500];
        const baseFreq =
          variations[Math.floor(Math.random() * variations.length)];
        this.playTone(baseFreq, 'sine', 0.12, 0.15, baseFreq + 150);
        break;
      }

      case 'score':
      case 'match': {
        // Pitch scales up with cascade tier
        const baseFreq = 500 * Math.pow(1.08, Math.min(tier, 10));
        this.playTone(baseFreq, 'triangle', 0.15, 0.15);
        this.playTone(baseFreq * 1.5, 'sine', 0.2, 0.1);
        break;
      }

      case 'reward':
      case 'rainbow':
        this.playTone(600, 'square', 0.3, 0.1, 1200);
        this.playTone(800, 'sine', 0.4, 0.1);
        break;

      case 'explosion':
        this.playNoise(0.4, 0.3);
        this.playTone(180, 'sawtooth', 0.35, 0.2, 40);
        break;

      case 'clear': {
        const chords = [523.25, 659.25, 783.99, 1046.5];
        chords.forEach((freq, i) => {
          setTimeout(() => {
            this.playTone(freq, 'triangle', 0.4, 0.15, freq * 1.01);
          }, i * 80);
        });
        break;
      }

      case 'error':
      case 'invalid':
      case 'gameover':
        this.playTone(280, 'sawtooth', 0.2, 0.12, 120);
        break;
    }
  }

  // --- Convenient Helper Aliases (Backward Compatibility for LLMs) ---

  public static playSwap() {
    this.play('swap');
  }
  public static playMatch(tier?: number) {
    this.play('score', tier);
  }
  public static playInvalid() {
    this.play('error');
  }
  public static playExplosion() {
    this.play('explosion');
  }
  public static playRainbow() {
    this.play('reward');
  }

  public static toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }
}

// Global instance export for `import audio from './Audio'` compatibility
export const audio = Audio;
export default Audio;
