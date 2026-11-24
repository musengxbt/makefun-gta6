// audio.js — all sound is synthesised with WebAudio: no audio files, nothing
// to load. A tiny engine hum whose pitch follows speed, two-tone sirens when
// cruisers are close, noise bursts for gunfire and crashes, and short blip
// melodies for pickups and mission results. The context is created lazily on
// the first user gesture, as browsers require, and M mutes the master gain.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return true;
  }

  function tone(freq, dur, type = 'square', vol = 0.16, slideTo = null, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.2, freq = 1200, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  /** Start (or keep) the engine loop; speedRatio 0..1 drives pitch. */
  function engine(speedRatio, dt) {
    if (!ensure()) return;
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter).connect(engineGain).connect(master);
      engineOsc.start();
    }
    const target = speedRatio > 0.02 ? 0.05 + speedRatio * 0.05 : 0.0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, ctx.currentTime, 0.08);
    void dt;
  }

  function engineStop() {
    if (engineGain && ctx) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }

  /** Sirens while police are near: a two-tone warble whose gain the caller sets. */
  function siren(level, dt) {
    if (!ensure()) return;
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
    }
    sirenFlip += dt;
    const hi = sirenFlip % 0.72 < 0.36;
    sirenOsc.frequency.setTargetAtTime(hi ? 880 : 660, ctx.currentTime, 0.03);
    sirenGain.gain.setTargetAtTime(level * 0.045, ctx.currentTime, 0.1);
  }

  function sirenStop() {
    if (sirenGain && ctx) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }

  return {
    unlock: ensure,
    engine,
    engineStop,
    siren,
    sirenStop,
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
      return muted;
    },
    isMuted: () => muted,
    click: () => tone(660, 0.06, 'square', 0.1),
    horn: () => { tone(392, 0.17, 'square', 0.11); tone(330, 0.17, 'square', 0.1, null, 0.01); },
    pickup: () => { tone(880, 0.07, 'square', 0.13); tone(1320, 0.1, 'square', 0.13, null, 0.06); },
    coin: () => { tone(1180, 0.05, 'square', 0.1); tone(1560, 0.09, 'square', 0.1, null, 0.045); },
    punch: () => noise(0.09, 0.22, 500),
    shot: () => { noise(0.13, 0.3, 2600); tone(140, 0.08, 'square', 0.12, 60); },
    dryFire: () => tone(1900, 0.03, 'square', 0.06),
    crash: (hard) => noise(hard ? 0.34 : 0.16, hard ? 0.34 : 0.18, 800),
    door: () => { tone(220, 0.07, 'square', 0.1, 160); noise(0.05, 0.08, 900, 0.02); },
    hurt: () => tone(196, 0.14, 'sawtooth', 0.14, 130),
    success: () => { tone(523, 0.1, 'square', 0.13); tone(659, 0.1, 'square', 0.13, null, 0.09); tone(784, 0.16, 'square', 0.14, null, 0.18); },
    fail: () => { tone(392, 0.12, 'square', 0.12); tone(311, 0.2, 'square', 0.12, null, 0.1); },
    bustedJingle: () => { tone(440, 0.14, 'triangle', 0.16); tone(440, 0.14, 'triangle', 0.16, null, 0.2); tone(349, 0.3, 'triangle', 0.16, null, 0.4); },
    wastedJingle: () => { tone(330, 0.2, 'sawtooth', 0.12, 220); tone(220, 0.34, 'sawtooth', 0.12, 110, 0.16); },
    levelup: () => { tone(659, 0.08, 'square', 0.12); tone(880, 0.14, 'square', 0.12, null, 0.07); },
  };
}
