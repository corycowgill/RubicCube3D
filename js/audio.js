// Procedural audio: chiptune-ish background loop + click/win SFX, all from Web Audio.
// No external files required, so the game stays a single-folder static drop-in.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicEnabled = false;
    this.sfxEnabled = true;
    this._musicTimer = null;
    this._step = 0;
    this._tempo = 112; // BPM
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.7;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0; // ramped on toggle
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.55;
    this.sfxGain.connect(this.masterGain);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMusic(on) {
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    this.musicEnabled = on;
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    if (on) {
      this.musicGain.gain.linearRampToValueAtTime(0.18, now + 0.4);
      this._startMusic();
    } else {
      this.musicGain.gain.linearRampToValueAtTime(0.0, now + 0.4);
      this._stopMusic();
    }
  }

  setSfx(on) {
    this.sfxEnabled = !!on;
  }

  // ---------- Background music ----------
  _startMusic() {
    if (this._musicTimer) return;
    this._step = 0;
    const stepDur = 60 / this._tempo / 2; // 8th notes
    const tick = () => {
      if (!this.musicEnabled || !this.ctx) {
        this._musicTimer = null;
        return;
      }
      const t = this.ctx.currentTime;
      // Schedule a few steps ahead in case of jitter
      for (let i = 0; i < 4; i++) {
        this._scheduleStep(this._step + i, t + i * stepDur);
      }
      this._step += 4;
      this._musicTimer = setTimeout(tick, stepDur * 4 * 1000);
    };
    tick();
  }

  _stopMusic() {
    if (this._musicTimer) {
      clearTimeout(this._musicTimer);
      this._musicTimer = null;
    }
  }

  _scheduleStep(step, when) {
    // 16-step bass + lead with chord progression every 8 bars
    const bar = Math.floor(step / 16) % 4;
    const stepInBar = step % 16;

    // Chord roots (A minor pop-ish: Am - F - C - G)
    const roots = [220.00, 174.61, 261.63, 196.00];
    const root = roots[bar];

    // Bass: root on beats 1 & 9 + occasional fifth
    if (stepInBar === 0 || stepInBar === 8) {
      this._playTone(root / 2, when, 0.35, { type: 'square', vol: 0.18, attack: 0.005, decay: 0.25 });
    } else if (stepInBar === 6 || stepInBar === 14) {
      this._playTone(root * 0.75, when, 0.18, { type: 'square', vol: 0.10, attack: 0.005, decay: 0.12 });
    }

    // Hi-hat: every other 8th
    if (stepInBar % 2 === 0) {
      this._playNoise(when, 0.04, 0.04);
    }

    // Lead arpeggio
    const arp = [0, 4, 7, 12, 7, 4, 0, -5];
    const interval = arp[stepInBar % arp.length];
    const semi = (n) => Math.pow(2, n / 12);
    const leadFreq = root * 2 * semi(interval);
    if (stepInBar % 1 === 0) {
      this._playTone(leadFreq, when, 0.18, { type: 'triangle', vol: 0.07, attack: 0.005, decay: 0.16 });
    }

    // Pad on bar transitions
    if (stepInBar === 0) {
      const chord = [root, root * semi(3), root * semi(7)];
      for (const f of chord) {
        this._playTone(f, when, 1.6, { type: 'sine', vol: 0.04, attack: 0.4, decay: 1.4 });
      }
    }
  }

  _playTone(freq, when, dur, { type = 'sine', vol = 0.1, attack = 0.005, decay = 0.2 } = {}) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(this.musicGain);
    const t0 = Math.max(when, this.ctx.currentTime);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
  }

  _playNoise(when, dur, vol = 0.05) {
    if (!this.ctx) return;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filt).connect(g).connect(this.musicGain);
    const t0 = Math.max(when, this.ctx.currentTime);
    src.start(t0);
  }

  // ---------- SFX ----------
  click() {
    if (!this.ctx || !this.sfxEnabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.08);
    osc.connect(g);
    g.connect(this.sfxGain);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  whoosh() {
    if (!this.ctx || !this.sfxEnabled) return;
    const t = this.ctx.currentTime;
    const dur = 0.18;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + dur);
    f.Q.value = 6;
    const g = this.ctx.createGain();
    g.gain.value = 0.18;
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start(t);
  }

  win() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    notes.forEach((f, i) => {
      const t = t0 + i * 0.12;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.connect(g);
      g.connect(this.sfxGain);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }
}
