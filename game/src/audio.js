// Sound, all synthesized with WebAudio: an engine hum that follows throttle and speed,
// a two-note chime when a ring is passed, and a soft thud on touchdown. No sound files,
// no network. The audio context is created lazily on the first user gesture, and every
// function is safe to call before that (it simply stays silent).

import { createRandom } from './random.js';

export function createAudio(random) {
  const rng = random && typeof random.next === 'function' ? random : createRandom(701);

  let ctx = null;
  let masterGain = null;
  let engineGain = null;
  let engineFilter = null;
  let primaryOsc = null;
  let subOsc = null;
  let noiseGain = null;
  let noiseFilter = null;
  let noiseBuffer = null;
  let lastThrottle = 0;
  let lastSpeed;

  function ensure() {
    if (!ctx) {
      const AudioCtx = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext)
        : null;
      if (!AudioCtx) return false;
      try {
        ctx = new AudioCtx();
        setupEngineGraph();
      } catch (_err) {
        ctx = null;
        return false;
      }
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    applyEngineParams(lastThrottle, lastSpeed, true);
    return true;
  }

  function setupEngineGraph() {
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(ctx.destination);

    noiseBuffer = buildSeamlessNoiseBuffer(ctx, rng, 1.5);

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 200;
    engineFilter.Q.value = 0.9;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0001;

    primaryOsc = ctx.createOscillator();
    primaryOsc.type = 'sawtooth';
    primaryOsc.frequency.value = 56;

    subOsc = ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.value = 28;

    const subMix = ctx.createGain();
    subMix.gain.value = 0.55;

    primaryOsc.connect(engineFilter);
    subOsc.connect(subMix);
    subMix.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 140;
    noiseFilter.Q.value = 1.1;

    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0001;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    primaryOsc.start();
    subOsc.start();
    noiseSource.start();
  }

  function applyEngineParams(throttleInput, speedInput, immediate) {
    if (!ctx || !primaryOsc) return;
    const throttle = clampFinite(throttleInput, 0, 1);
    const hasSpeed = typeof speedInput === 'number' && Number.isFinite(speedInput);
    const speedNorm = hasSpeed
      ? clampFinite(speedInput / 95, 0, 1.2)
      : 0.28 + throttle * 0.72;

    const baseFreq = 52 + throttle * 62 + speedNorm * 28;
    const cutoff = 170 + throttle * 360 + speedNorm * 190;
    const oscLevel = 0.024 + throttle * 0.076 + speedNorm * 0.035;
    const bandFreq = 120 + throttle * 210 + speedNorm * 130;
    const noiseLevel = 0.008 + throttle * 0.036 + speedNorm * 0.024;

    const now = ctx.currentTime;
    const freqTau = immediate ? 0.02 : 0.14;
    const gainTau = immediate ? 0.02 : 0.08;

    primaryOsc.frequency.setTargetAtTime(baseFreq, now, freqTau);
    subOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, freqTau);
    engineFilter.frequency.setTargetAtTime(cutoff, now, gainTau);
    engineGain.gain.setTargetAtTime(oscLevel, now, gainTau);
    noiseFilter.frequency.setTargetAtTime(bandFreq, now, gainTau);
    noiseGain.gain.setTargetAtTime(noiseLevel, now, gainTau);
  }

  function setThrottle(t, speed) {
    lastThrottle = clampFinite(t, 0, 1);
    lastSpeed = typeof speed === 'number' && Number.isFinite(speed) ? speed : undefined;
    applyEngineParams(lastThrottle, lastSpeed, false);
  }

  function ring() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    playSineNote(ctx, masterGain, 880, now, 0.16, 0.18);
    playSineNote(ctx, masterGain, 1320, now + 0.09, 0.28, 0.2);
  }

  function touchdown() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(110, now);
    thudOsc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.linearRampToValueAtTime(0.22, now + 0.01);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    thudOsc.connect(thudGain);
    thudGain.connect(masterGain);
    thudOsc.start(now);
    thudOsc.stop(now + 0.24);
    thudOsc.onended = () => {
      thudOsc.disconnect();
      thudGain.disconnect();
    };

    if (noiseBuffer) {
      const tireSource = ctx.createBufferSource();
      const tireFilter = ctx.createBiquadFilter();
      const tireGain = ctx.createGain();
      tireSource.buffer = noiseBuffer;
      tireFilter.type = 'lowpass';
      tireFilter.frequency.setValueAtTime(340, now);
      tireFilter.frequency.exponentialRampToValueAtTime(140, now + 0.16);
      tireGain.gain.setValueAtTime(0.0001, now);
      tireGain.gain.linearRampToValueAtTime(0.09, now + 0.012);
      tireGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      tireSource.connect(tireFilter);
      tireFilter.connect(tireGain);
      tireGain.connect(masterGain);
      tireSource.start(now);
      tireSource.stop(now + 0.18);
      tireSource.onended = () => {
        tireSource.disconnect();
        tireFilter.disconnect();
        tireGain.disconnect();
      };
    }
  }

  return { ensure, setThrottle, ring, touchdown };
}

function playSineNote(ctx, destination, freq, startTime, duration, peakGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

function buildSeamlessNoiseBuffer(ctx, rng, seconds) {
  const length = Math.max(2048, Math.floor(ctx.sampleRate * seconds));
  const blend = 1024;
  const raw = new Float32Array(length + blend);
  let filtered = 0;
  for (let i = 0; i < raw.length; i++) {
    const white = rng.next() * 2 - 1;
    filtered = filtered * 0.82 + white * 0.18;
    raw[i] = filtered * 2.1;
  }
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const out = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    if (i < blend) {
      const mix = i / blend;
      out[i] = raw[i] * mix + raw[length + i] * (1 - mix);
    } else {
      out[i] = raw[i];
    }
  }
  return buffer;
}

function clampFinite(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
