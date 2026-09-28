// Original, quiet pentatonic score. Web Audio creates every note locally.
// No audio context or playback exists until the user taps the music button.
const CHORDS = [[48,55,64], [45,52,60], [41,48,57], [43,50,62]];
const MELODY = [76,null,79,74,72,null,67,null, 72,null,76,79,81,null,76,null,
  77,null,76,72,69,null,72,null, 74,null,79,76,74,null,67,null];
const BEAT = .72;

export class IslandMusic {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.timer = null;
    this.voices = new Set();
    this.step = 0;
  }

  createContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio unavailable');
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = .2;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    this.master.connect(filter).connect(this.context.destination);
  }

  async toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.pause();
    else await this.resume();
    return this.enabled;
  }

  async resume() {
    if (!this.enabled) return;
    try {
      if (!this.context) this.createContext();
      await this.context.resume();
      if (!this.enabled || document.hidden) {
        this.pause();
        return;
      }
      if (this.context.state !== 'running') throw new Error('Audio is interrupted');
      // A single scheduler survives repeated visibility notifications.
      if (this.timer !== null) return;
      this.nextNote = this.context.currentTime + .08;
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 100);
    } catch (error) {
      this.enabled = false;
      this.pause();
      throw error;
    }
  }

  pause() {
    clearInterval(this.timer);
    this.timer = null;
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    if (this.context) this.context.suspend().catch(() => {});
  }

  note(midi, start, duration, volume, type = 'sine') {
    const context = this.context;
    const oscillator = context.createOscillator(), envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + .08);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope).connect(this.master);
    oscillator.onended = () => {
      this.voices.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
    this.voices.add(oscillator);
    oscillator.start(start);
    oscillator.stop(start + duration + .05);
  }

  schedule() {
    if (!this.enabled || this.context.state !== 'running') return;
    // If a browser stalls, resume the phrase rather than scheduling a burst of old notes.
    if (this.nextNote < this.context.currentTime) this.nextNote = this.context.currentTime + .05;
    while (this.nextNote < this.context.currentTime + .25) {
      const step = this.step % MELODY.length;
      if (step % 8 === 0) {
        for (const midi of CHORDS[Math.floor(step / 8)]) this.note(midi, this.nextNote, BEAT * 7.5, .1);
      }
      const melody = MELODY[step];
      if (melody !== null) {
        this.note(melody, this.nextNote, 2.2, .17);
        this.note(melody + 12, this.nextNote + .015, 1.3, .025, 'triangle');
        this.note(melody, this.nextNote + BEAT * .75, 1.8, .035);
      }
      this.step++;
      this.nextNote += BEAT;
    }
  }
}
