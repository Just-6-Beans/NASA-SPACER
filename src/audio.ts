// Web Audio synthesis for every cue. Unlocks on the first user gesture.
type Cue = 'ui' | 'step' | 'launch' | 'success' | 'fail' | 'relay' | 'telemetry' | 'alert' | 'dock' | 'drive' | 'shutter' | 'drill' | 'charge' | 'heat'

class Sound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  muted = false

  constructor() {
    try { this.muted = localStorage.getItem('spacer.muted') === '1' } catch { /* storage unavailable */ }
    const unlock = () => { this.ensure(); this.ctx?.resume() }
    window.addEventListener('pointerdown', unlock, { once: false, passive: true })
    window.addEventListener('keydown', unlock, { once: false })
  }

  private ensure() {
    if (this.ctx) return this.ctx
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.5
    this.master.connect(this.ctx.destination)
    return this.ctx
  }

  setMuted(m: boolean) {
    this.muted = m
    try { localStorage.setItem('spacer.muted', m ? '1' : '0') } catch { /* ignore */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02)
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, start)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur)
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    o.connect(g).connect(this.master!)
    o.start(start)
    o.stop(start + dur + 0.05)
  }

  private noise(start: number, dur: number, vol: number, freq: number, q = 1) {
    const ctx = this.ctx!
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, start)
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    src.connect(f).connect(g).connect(this.master!)
    src.start(start)
  }

  play(cue: Cue) {
    if (this.muted) return
    const ctx = this.ensure()
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    switch (cue) {
      case 'ui': this.tone(880, t, 0.06, 'triangle', 0.08); break
      case 'step': this.noise(t, 0.07, 0.12, 380 + Math.random() * 120, 2); break
      case 'launch': this.noise(t, 3.5, 0.5, 90, 0.6); this.noise(t + 0.2, 3, 0.25, 260, 0.8); this.tone(55, t, 3.5, 'sawtooth', 0.06, 110); break
      case 'dock': this.tone(220, t, 0.25, 'square', 0.06); this.noise(t + 0.05, 0.35, 0.3, 160, 1.5); break
      case 'success': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.08, 0.22, 'triangle', 0.14)); break
      case 'fail': this.tone(180, t, 0.18, 'sawtooth', 0.1, 120); this.tone(150, t + 0.16, 0.22, 'sawtooth', 0.1, 90); break
      case 'relay': for (let i = 0; i < 3; i++) { this.tone(740, t + i * 0.36, 0.16, 'square', 0.08); this.tone(520, t + i * 0.36 + 0.17, 0.16, 'square', 0.08) } break
      case 'alert': this.tone(660, t, 0.12, 'square', 0.07); this.tone(660, t + 0.18, 0.12, 'square', 0.07); break
      case 'drive': this.noise(t, 1.4, 0.18, 140, 1.2); this.tone(90, t, 1.4, 'sawtooth', 0.04, 120); break
      case 'shutter': this.noise(t, 0.04, 0.3, 2400, 3); this.noise(t + 0.09, 0.04, 0.25, 1800, 3); break
      case 'drill': for (let i = 0; i < 10; i++) this.noise(t + i * 0.09, 0.06, 0.2, 900 + (i % 2) * 400, 4); break
      case 'charge': this.tone(330, t, 0.6, 'sine', 0.08, 660); this.tone(495, t + 0.1, 0.6, 'sine', 0.05, 990); break
      case 'heat': this.tone(196, t, 0.8, 'triangle', 0.07, 220); break
      case 'telemetry': this.tone(1200, t, 0.05, 'sine', 0.1); this.tone(1600, t + 0.07, 0.05, 'sine', 0.1); this.tone(2000, t + 0.14, 0.12, 'sine', 0.1, 1400); break
    }
  }
}

export const sound = new Sound()
