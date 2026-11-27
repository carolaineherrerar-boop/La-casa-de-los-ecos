import type { AnomalyKind } from './types';

export class HorrorAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private wetBus: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private convolver: ConvolverNode | null = null;
  private softClipper: WaveShaperNode | null = null;

  // Ambient continuous nodes
  private humGain: GainNode | null = null;
  private humOsc60: OscillatorNode | null = null;
  private humOsc120: OscillatorNode | null = null;
  private humLfo: OscillatorNode | null = null;
  private humNoiseGain: GainNode | null = null;
  private roomDroneGain: GainNode | null = null;
  private roomNoiseSource: AudioBufferSourceNode | null = null;
  private humNoiseSource: AudioBufferSourceNode | null = null;

  // Music system nodes
  private musicGain: GainNode | null = null;
  private musicPadGain: GainNode | null = null;
  private musicPadFilter: BiquadFilterNode | null = null;
  private musicPadOsc1: OscillatorNode | null = null;
  private musicPadOsc2: OscillatorNode | null = null;
  private musicStepTimer = 0;
  private musicStepIndex = 0;

  // Noise buffers
  private whiteBuffer: AudioBuffer | null = null;
  private pinkBuffer: AudioBuffer | null = null;
  private brownBuffer: AudioBuffer | null = null;

  private muted = false;
  private musicVolume = 0.85;
  private sfxVolume = 1.0;
  private lastSombraCueTime = 0;
  private nextCreakDelay = 4.5;
  private nextWhisperDelay = 7.0;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.88, now, 0.04);
    }
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    if (this.musicBus && this.ctx) {
      const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setTargetAtTime(this.musicVolume, now, 0.04);
    }
  }

  public setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (this.sfxBus && this.ctx) {
      const now = this.ctx.currentTime;
      this.sfxBus.gain.cancelScheduledValues(now);
      this.sfxBus.gain.setTargetAtTime(this.sfxVolume, now, 0.04);
    }
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 18;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.22;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.88;

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;

      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVolume;

      this.dryBus = ctx.createGain();
      this.dryBus.gain.value = 0.92;

      this.wetBus = ctx.createGain();
      this.wetBus.gain.value = 0.36;

      this.convolver = ctx.createConvolver();
      this.convolver.buffer = this.createHallImpulse(ctx, 1.9);

      this.softClipper = ctx.createWaveShaper();
      this.softClipper.curve = this.createSaturationCurve(22);
      this.softClipper.oversample = '2x';

      this.dryBus.connect(this.sfxBus);
      this.wetBus.connect(this.convolver);
      this.convolver.connect(this.sfxBus);
      this.sfxBus.connect(this.compressor);
      this.musicBus.connect(this.compressor);
      this.compressor.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);

      this.whiteBuffer = this.createWhiteNoiseBuffer(ctx, 2.5);
      this.pinkBuffer = this.createPinkNoiseBuffer(ctx, 3.0);
      this.brownBuffer = this.createBrownNoiseBuffer(ctx, 4.0);

      this.startAmbientSoundscape(ctx);
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createSaturationCurve(drive: number): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * drive);
    }
    return curve;
  }

  private createWhiteNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createPinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.153852;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private createBrownNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.024 * white) / 1.024;
      data[i] = Math.max(-1, Math.min(1, lastOut * 3.4));
    }
    return buffer;
  }

  private createHallImpulse(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const decay = Math.pow(1 - t, 2.75);
        // Dark wooden hallway low-pass absorption in reverb tail
        const white = Math.random() * 2 - 1;
        lp = lp * 0.68 + white * 0.32;
        data[i] = lp * decay * 0.65;
      }
    }
    return impulse;
  }

  private routeNode(node: AudioNode, pan = 0, wetAmount = 0.35): void {
    if (!this.ctx || !this.dryBus || !this.wetBus) return;
    if (pan !== 0 && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner);
      panner.connect(this.dryBus);
      if (wetAmount > 0) {
        const w = this.ctx.createGain();
        w.gain.value = wetAmount;
        panner.connect(w);
        w.connect(this.wetBus);
      }
    } else {
      node.connect(this.dryBus);
      if (wetAmount > 0) {
        const w = this.ctx.createGain();
        w.gain.value = wetAmount;
        node.connect(w);
        w.connect(this.wetBus);
      }
    }
  }

  private startAmbientSoundscape(ctx: AudioContext): void {
    if (!this.dryBus || !this.brownBuffer || !this.pinkBuffer) return;

    // 1. Deep house room-tone rumble (filtered brown noise)
    this.roomDroneGain = ctx.createGain();
    this.roomDroneGain.gain.value = 0.14;
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = 'lowpass';
    droneLp.frequency.value = 115;

    this.roomNoiseSource = ctx.createBufferSource();
    this.roomNoiseSource.buffer = this.brownBuffer;
    this.roomNoiseSource.loop = true;
    this.roomNoiseSource.connect(droneLp);
    droneLp.connect(this.roomDroneGain);
    this.roomDroneGain.connect(this.dryBus);
    this.roomNoiseSource.start();

    // 2. Tense flashlight electrical hum (warm sine transformer + filtered corona fizz)
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.025;

    this.humOsc60 = ctx.createOscillator();
    this.humOsc60.type = 'sine';
    this.humOsc60.frequency.value = 59.5;

    this.humOsc120 = ctx.createOscillator();
    this.humOsc120.type = 'sine';
    this.humOsc120.frequency.value = 119.2;
    const h2Gain = ctx.createGain();
    h2Gain.gain.value = 0.35;

    // Subtle 7Hz LFO modulation for unstable battery hum
    this.humLfo = ctx.createOscillator();
    this.humLfo.type = 'sine';
    this.humLfo.frequency.value = 6.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.008;
    this.humLfo.connect(lfoGain);
    lfoGain.connect(this.humGain.gain);

    this.humOsc60.connect(this.humGain);
    this.humOsc120.connect(h2Gain);
    h2Gain.connect(this.humGain);
    this.humGain.connect(this.dryBus);

    // Filtered pink electrical air/filament hiss
    this.humNoiseGain = ctx.createGain();
    this.humNoiseGain.gain.value = 0.012;
    const humBp = ctx.createBiquadFilter();
    humBp.type = 'bandpass';
    humBp.frequency.value = 1850;
    humBp.Q.value = 3.2;
    this.humNoiseSource = ctx.createBufferSource();
    this.humNoiseSource.buffer = this.pinkBuffer;
    this.humNoiseSource.loop = true;
    this.humNoiseSource.connect(humBp);
    humBp.connect(this.humNoiseGain);
    this.humNoiseGain.connect(this.dryBus);

    this.humOsc60.start();
    this.humOsc120.start();
    this.humLfo.start();
    this.humNoiseSource.start();

    // 3. Procedural cinematic driving music bus + dark atmospheric tension pad
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.musicBus!);

    this.musicPadGain = ctx.createGain();
    this.musicPadGain.gain.value = 0.085;
    this.musicPadFilter = ctx.createBiquadFilter();
    this.musicPadFilter.type = 'lowpass';
    this.musicPadFilter.frequency.value = 260;
    this.musicPadFilter.Q.value = 1.1;

    this.musicPadOsc1 = ctx.createOscillator();
    this.musicPadOsc1.type = 'sawtooth';
    this.musicPadOsc1.frequency.value = 73.42; // D2

    this.musicPadOsc2 = ctx.createOscillator();
    this.musicPadOsc2.type = 'sine';
    this.musicPadOsc2.frequency.value = 110.0; // A2

    this.musicPadOsc1.connect(this.musicPadFilter);
    this.musicPadOsc2.connect(this.musicPadFilter);
    this.musicPadFilter.connect(this.musicPadGain);
    this.musicPadGain.connect(this.musicGain);

    this.musicPadOsc1.start();
    this.musicPadOsc2.start();
  }

  public updateHum(active: boolean, batteryPct: number): void {
    if (!this.ctx || !this.humGain || !this.humOsc60 || !this.humNoiseGain || !this.roomDroneGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const lowStress = batteryPct < 28 ? (28 - batteryPct) / 28 : 0;

    const humTarget = active ? (batteryPct <= 0 ? 0.005 : 0.026 + lowStress * 0.036) : 0.016;
    const hissTarget = active ? (batteryPct <= 0 ? 0.002 : 0.01 + lowStress * 0.025) : 0.006;

    this.humGain.gain.setTargetAtTime(humTarget, now, 0.14);
    this.humNoiseGain.gain.setTargetAtTime(hissTarget, now, 0.14);
    this.humOsc60.frequency.setTargetAtTime(59.5 - lowStress * 4.2, now, 0.25);
    this.roomDroneGain.gain.setTargetAtTime(active ? 0.18 : 0.11, now, 0.2);
  }

  public updateAmbience(dt: number, active: boolean): void {
    if (!this.ctx || this.muted || !active) return;

    this.nextCreakDelay -= dt;
    if (this.nextCreakDelay <= 0) {
      this.nextCreakDelay = 6.5 + Math.random() * 7.5;
      this.playDistantCreak();
    }

    this.nextWhisperDelay -= dt;
    if (this.nextWhisperDelay <= 0) {
      this.nextWhisperDelay = 9.0 + Math.random() * 9.0;
      this.playEerieWhisper();
    }
  }

  public updateMusic(dt: number, active: boolean, tension: number): void {
    if (!this.ctx || !this.musicGain || !this.musicPadFilter || !this.musicPadGain) return;
    const now = this.ctx.currentTime;
    const clampedT = Math.max(0, Math.min(1, tension));

    const targetVol = active ? 0.36 + clampedT * 0.14 : 0;
    this.musicGain.gain.setTargetAtTime(targetVol, now, active ? 0.25 : 0.12);
    this.musicPadFilter.frequency.setTargetAtTime(220 + clampedT * 380, now, 0.2);
    this.musicPadGain.gain.setTargetAtTime(0.075 + clampedT * 0.055, now, 0.2);

    if (!active || this.muted || this.musicVolume <= 0.005) {
      if (!active) {
        this.musicStepTimer = 0;
        this.musicStepIndex = 0;
      }
      return;
    }

    // Driving 8th-note rhythmic pulse: 106 BPM base up to 128 BPM under intense threat
    const bpm = 106 + clampedT * 22;
    const stepDur = 60 / bpm / 2;
    this.musicStepTimer += dt;
    if (this.musicStepTimer >= stepDur) {
      this.musicStepTimer -= stepDur;
      this.triggerMusicStep(this.musicStepIndex, clampedT, stepDur);
      this.musicStepIndex = (this.musicStepIndex + 1) % 16;
    }
  }

  private triggerMusicStep(step: number, tension: number, stepDur: number): void {
    if (!this.ctx || !this.musicGain || !this.pinkBuffer || !this.brownBuffer) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 16-step D Phrygian/Minor cinematic bass progression (Hz)
    const bassNotes = [
      36.71, 36.71, 43.65, 36.71, 32.7, 36.71, 38.89, 36.71,
      36.71, 27.5, 32.7, 36.71, 43.65, 41.2, 32.7, 29.14,
    ];
    const freq = bassNotes[step];

    // Driving deep sub-bass + low-passed warm sawtooth pulse
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq, now);
    const accent = step % 4 === 0 ? 1.0 : step % 2 === 0 ? 0.78 : 0.55;
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.28 * accent, now + 0.012);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + stepDur * 0.92);
    subOsc.connect(subGain);
    subGain.connect(this.musicGain);
    subOsc.start(now);
    subOsc.stop(now + stepDur);

    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = 'sawtooth';
    pulseOsc.frequency.setValueAtTime(freq * 2, now);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const peakCut = (260 + tension * 340) * accent;
    lp.frequency.setValueAtTime(peakCut, now);
    lp.frequency.exponentialRampToValueAtTime(115, now + stepDur * 0.85);
    lp.Q.value = 2.2;

    const pGain = ctx.createGain();
    pGain.gain.setValueAtTime(0.001, now);
    pGain.gain.linearRampToValueAtTime(0.14 * accent, now + 0.01);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + stepDur * 0.88);
    pulseOsc.connect(lp);
    lp.connect(pGain);
    pGain.connect(this.musicGain);
    pulseOsc.start(now);
    pulseOsc.stop(now + stepDur);

    // Cinematic low heartbeat kick on primary beats (and driving push under tension)
    const isKick = step % 4 === 0 || (tension > 0.45 && (step === 6 || step === 14));
    if (isKick) {
      const kick = ctx.createOscillator();
      const kGain = ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(84, now);
      kick.frequency.exponentialRampToValueAtTime(32, now + 0.14);
      kGain.gain.setValueAtTime(0.32, now);
      kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      kick.connect(kGain);
      kGain.connect(this.musicGain);
      kick.start(now);
      kick.stop(now + 0.18);
    }

    // Tight brushed industrial rhythmic pulse tick
    const isTick = step % 2 === 1 || tension > 0.55;
    if (isTick) {
      const tick = ctx.createBufferSource();
      tick.buffer = this.pinkBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = step % 4 === 2 ? 3600 : 2800;
      bp.Q.value = 3.2;

      const tGain = ctx.createGain();
      const tickVol = (step % 2 === 1 ? 0.045 : 0.025) * (0.65 + tension * 0.65);
      tGain.gain.setValueAtTime(tickVol, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      tick.connect(bp);
      bp.connect(tGain);
      if (this.ctx.createStereoPanner) {
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = step % 2 === 0 ? -0.24 : 0.24;
        tGain.connect(pan);
        pan.connect(this.musicGain);
      } else {
        tGain.connect(this.musicGain);
      }
      tick.start(now, Math.random() * 1.2, 0.04);
    }

    // Subtle atmospheric tension harmonic on bar turns when threat is high
    if (tension > 0.5 && (step === 0 || step === 8)) {
      const shimmer = ctx.createOscillator();
      const sG = ctx.createGain();
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(step === 0 ? 440 : 466.16, now); // A4 / Bb4 tension
      sG.gain.setValueAtTime(0.001, now);
      sG.gain.linearRampToValueAtTime(0.036 * tension, now + 0.08);
      sG.gain.exponentialRampToValueAtTime(0.001, now + stepDur * 4.2);
      shimmer.connect(sG);
      sG.connect(this.musicGain);
      shimmer.start(now);
      shimmer.stop(now + stepDur * 4.3);
    }
  }

  private playDistantCreak(): void {
    if (!this.ctx || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pan = (Math.random() > 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.45);

    // Resonant strained timber groan
    const noise = ctx.createBufferSource();
    noise.buffer = this.pinkBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const startFreq = 165 + Math.random() * 95;
    bp.frequency.setValueAtTime(startFreq, now);
    bp.frequency.linearRampToValueAtTime(startFreq * 0.74, now + 0.55);
    bp.frequency.linearRampToValueAtTime(startFreq * 0.88, now + 1.05);
    bp.Q.value = 11.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.15);

    noise.connect(bp);
    bp.connect(gain);
    this.routeNode(gain, pan, 0.82);
    noise.start(now, Math.random() * 1.2, 1.2);
  }

  private playEerieWhisper(): void {
    if (!this.ctx || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pan = (Math.random() - 0.5) * 1.4;

    const breath = ctx.createBufferSource();
    breath.buffer = this.pinkBuffer;

    // Dual vocal-tract formant filters for realistic breathy whisper
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(620, now);
    f1.frequency.linearRampToValueAtTime(430, now + 1.4);
    f1.Q.value = 4.8;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1750, now);
    f2.frequency.linearRampToValueAtTime(1180, now + 1.4);
    f2.Q.value = 5.5;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.001, now);
    env.gain.linearRampToValueAtTime(0.09, now + 0.35);
    env.gain.linearRampToValueAtTime(0.055, now + 0.9);
    env.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    breath.connect(f1);
    breath.connect(f2);
    f1.connect(env);
    f2.connect(env);
    this.routeNode(env, pan, 0.78);
    breath.start(now, Math.random() * 1.1, 1.55);
  }

  public playFootstep(stepIndex: number): void {
    if (!this.ctx || !this.brownBuffer || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const pan = stepIndex % 2 === 0 ? -0.14 : 0.14;

    // 1. Heavy heel sub-impact (sine body + brown low-pass weight)
    const heelOsc = ctx.createOscillator();
    const heelGain = ctx.createGain();
    heelOsc.type = 'sine';
    const basePitch = stepIndex % 2 === 0 ? 86 : 79;
    heelOsc.frequency.setValueAtTime(basePitch, now);
    heelOsc.frequency.exponentialRampToValueAtTime(32, now + 0.095);
    heelGain.gain.setValueAtTime(0.24, now);
    heelGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    heelOsc.connect(heelGain);
    this.routeNode(heelGain, pan, 0.25);
    heelOsc.start(now);
    heelOsc.stop(now + 0.12);

    const thumpNoise = ctx.createBufferSource();
    thumpNoise.buffer = this.brownBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(240, now);
    lp.frequency.exponentialRampToValueAtTime(85, now + 0.09);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.26, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    thumpNoise.connect(lp);
    lp.connect(tGain);
    this.routeNode(tGain, pan, 0.3);
    thumpNoise.start(now, Math.random() * 2.0, 0.11);

    // 2. Hollow hardwood plank resonance + grit scuff
    const plank = ctx.createBufferSource();
    plank.buffer = this.pinkBuffer;
    const woodBp = ctx.createBiquadFilter();
    woodBp.type = 'bandpass';
    woodBp.frequency.value = stepIndex % 2 === 0 ? 310 : 275;
    woodBp.Q.value = 3.4;
    const pGain = ctx.createGain();
    pGain.gain.setValueAtTime(0.11, now);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    plank.connect(woodBp);
    woodBp.connect(pGain);
    this.routeNode(pGain, pan, 0.36);
    plank.start(now, Math.random() * 1.5, 0.09);

    const grit = ctx.createBufferSource();
    grit.buffer = this.pinkBuffer;
    const gritBp = ctx.createBiquadFilter();
    gritBp.type = 'bandpass';
    gritBp.frequency.value = 2150 + Math.random() * 350;
    gritBp.Q.value = 1.6;
    const gGain = ctx.createGain();
    gGain.gain.setValueAtTime(0.045, now);
    gGain.gain.exponentialRampToValueAtTime(0.001, now + 0.042);
    grit.connect(gritBp);
    gritBp.connect(gGain);
    this.routeNode(gGain, pan, 0.22);
    grit.start(now, Math.random() * 1.5, 0.05);

    // Occasional subtle floorboard creak under weight
    if (stepIndex % 6 === 3) {
      const creak = ctx.createBufferSource();
      creak.buffer = this.pinkBuffer;
      const cBp = ctx.createBiquadFilter();
      cBp.type = 'bandpass';
      cBp.frequency.setValueAtTime(340, now + 0.02);
      cBp.frequency.linearRampToValueAtTime(260, now + 0.19);
      cBp.Q.value = 14;
      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(0.001, now + 0.02);
      cGain.gain.linearRampToValueAtTime(0.06, now + 0.05);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      creak.connect(cBp);
      cBp.connect(cGain);
      this.routeNode(cGain, pan, 0.45);
      creak.start(now + 0.02, Math.random(), 0.22);
    }
  }

  public playFlashlightClick(): void {
    if (!this.ctx || !this.whiteBuffer || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Stage 1: Crisp metallic spring detent snap
    const snap = ctx.createBufferSource();
    snap.buffer = this.whiteBuffer;
    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.value = 3400;
    bp1.Q.value = 4.2;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.32, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
    snap.connect(bp1);
    bp1.connect(g1);
    this.routeNode(g1, 0.12, 0.18);
    snap.start(now, 0.1, 0.025);

    // Stage 2: Heavy casing mechanical thunk 12ms later
    const thunk = ctx.createBufferSource();
    thunk.buffer = this.pinkBuffer;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = 1050;
    bp2.Q.value = 2.8;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.28, now + 0.012);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
    thunk.connect(bp2);
    bp2.connect(g2);
    this.routeNode(g2, 0.12, 0.22);
    thunk.start(now + 0.012, 0.3, 0.045);

    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(520, now + 0.012);
    bodyOsc.frequency.exponentialRampToValueAtTime(160, now + 0.042);
    bodyGain.gain.setValueAtTime(0.11, now + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    bodyOsc.connect(bodyGain);
    this.routeNode(bodyGain, 0.12, 0.15);
    bodyOsc.start(now + 0.012);
    bodyOsc.stop(now + 0.05);
  }

  public playPulse(): void {
    if (!this.ctx || !this.pinkBuffer || !this.brownBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    this.playFlashlightClick();

    // High-voltage capacitor discharge air sweep
    const surge = ctx.createBufferSource();
    surge.buffer = this.pinkBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3400, now);
    bp.frequency.exponentialRampToValueAtTime(220, now + 0.34);
    bp.Q.value = 1.9;
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.38, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    surge.connect(bp);
    bp.connect(sGain);
    this.routeNode(sGain, 0, 0.55);
    surge.start(now, 0.2, 0.4);

    // Deep electromagnetic thump
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(195, now);
    sub.frequency.exponentialRampToValueAtTime(44, now + 0.26);
    subGain.gain.setValueAtTime(0.28, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    sub.connect(subGain);
    this.routeNode(subGain, 0, 0.35);
    sub.start(now);
    sub.stop(now + 0.3);
  }

  public playBatteryPickup(): void {
    if (!this.ctx || !this.whiteBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Tactile metallic latch click
    const latch = ctx.createBufferSource();
    latch.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2650;
    bp.Q.value = 3.8;
    const lGain = ctx.createGain();
    lGain.gain.setValueAtTime(0.18, now);
    lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    latch.connect(bp);
    bp.connect(lGain);
    this.routeNode(lGain, 0, 0.25);
    latch.start(now, 0, 0.035);

    // Smooth rising electromagnetic charge swell + warm harmonic shimmer (sine only)
    const chargeOsc = ctx.createOscillator();
    const chargeGain = ctx.createGain();
    chargeOsc.type = 'sine';
    chargeOsc.frequency.setValueAtTime(185, now);
    chargeOsc.frequency.exponentialRampToValueAtTime(540, now + 0.24);
    chargeGain.gain.setValueAtTime(0.001, now);
    chargeGain.gain.linearRampToValueAtTime(0.16, now + 0.04);
    chargeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    chargeOsc.connect(chargeGain);
    this.routeNode(chargeGain, 0, 0.45);
    chargeOsc.start(now);
    chargeOsc.stop(now + 0.4);

    [523.25, 783.99].forEach((freq, idx) => {
      const bell = ctx.createOscillator();
      const bGain = ctx.createGain();
      bell.type = 'sine';
      const t = now + 0.06 + idx * 0.06;
      bell.frequency.setValueAtTime(freq, t);
      bGain.gain.setValueAtTime(0.001, t);
      bGain.gain.linearRampToValueAtTime(0.11, t + 0.02);
      bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
      bell.connect(bGain);
      this.routeNode(bGain, idx === 0 ? -0.2 : 0.2, 0.55);
      bell.start(t);
      bell.stop(t + 0.38);
    });
  }

  public playAnomalySpawn(kind: AnomalyKind): void {
    if (!this.ctx || !this.brownBuffer || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (kind === 'sombra') {
      // Deep rumbling pressure drop + cold breathy hiss
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(62, now);
      sub.frequency.exponentialRampToValueAtTime(34, now + 1.4);
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.28, now + 0.25);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
      sub.connect(subGain);
      this.routeNode(subGain, 0, 0.5);
      sub.start(now);
      sub.stop(now + 1.55);

      const whisper = ctx.createBufferSource();
      whisper.buffer = this.pinkBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(980, now);
      bp.frequency.linearRampToValueAtTime(480, now + 1.2);
      bp.Q.value = 5.2;
      const wGain = ctx.createGain();
      wGain.gain.setValueAtTime(0.001, now);
      wGain.gain.linearRampToValueAtTime(0.16, now + 0.2);
      wGain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      whisper.connect(bp);
      bp.connect(wGain);
      this.routeNode(wGain, -0.25, 0.72);
      whisper.start(now, 0.2, 1.35);
    } else if (kind === 'ojo') {
      // Unsettling wet ocular tension + high harmonic sine ring
      const air = ctx.createBufferSource();
      air.buffer = this.pinkBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(420, now);
      bp.frequency.exponentialRampToValueAtTime(1650, now + 0.85);
      bp.Q.value = 6.5;
      const aGain = ctx.createGain();
      aGain.gain.setValueAtTime(0.001, now);
      aGain.gain.linearRampToValueAtTime(0.16, now + 0.18);
      aGain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
      air.connect(bp);
      bp.connect(aGain);
      this.routeNode(aGain, 0.3, 0.65);
      air.start(now, 0.4, 1.1);

      const ring = ctx.createOscillator();
      const rGain = ctx.createGain();
      ring.type = 'sine';
      ring.frequency.setValueAtTime(880, now);
      ring.frequency.linearRampToValueAtTime(945, now + 0.9);
      rGain.gain.setValueAtTime(0.001, now);
      rGain.gain.linearRampToValueAtTime(0.075, now + 0.15);
      rGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      ring.connect(rGain);
      this.routeNode(rGain, 0.3, 0.6);
      ring.start(now);
      ring.stop(now + 1.05);
    } else if (kind === 'figura') {
      // Figura Errante: creeping hollow wood-joint clicks + eerie detuned porcelain chimes
      [0, 0.19, 0.39, 0.62].forEach((offset, idx) => {
        const click = ctx.createBufferSource();
        click.buffer = this.pinkBuffer!;
        const cBp = ctx.createBiquadFilter();
        cBp.type = 'bandpass';
        cBp.frequency.value = 1450 + idx * 160;
        cBp.Q.value = 4.5;
        const cG = ctx.createGain();
        const t = now + offset;
        cG.gain.setValueAtTime(0.14, t);
        cG.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        click.connect(cBp);
        cBp.connect(cG);
        this.routeNode(cG, idx % 2 === 0 ? -0.25 : 0.25, 0.6);
        click.start(t, Math.random(), 0.06);
      });

      [587.33, 830.61, 622.25].forEach((freq, idx) => {
        const chime = ctx.createOscillator();
        const g = ctx.createGain();
        chime.type = 'sine';
        const t = now + idx * 0.22;
        chime.frequency.setValueAtTime(freq, t);
        chime.frequency.linearRampToValueAtTime(freq * 0.975, t + 0.45);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.085, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        chime.connect(g);
        this.routeNode(g, -0.15, 0.72);
        chime.start(t);
        chime.stop(t + 0.55);
      });
    } else if (kind === 'prefecta') {
      // La Prefecta Sin Rostro: ominous hollow whistle-breath + slow authoritative boot heels
      const whistleAir = ctx.createBufferSource();
      whistleAir.buffer = this.pinkBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1450, now);
      bp.frequency.linearRampToValueAtTime(1180, now + 0.95);
      bp.Q.value = 14.0;
      const wG = ctx.createGain();
      wG.gain.setValueAtTime(0.001, now);
      wG.gain.linearRampToValueAtTime(0.16, now + 0.14);
      wG.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
      whistleAir.connect(bp);
      bp.connect(wG);
      this.routeNode(wG, 0.18, 0.78);
      whistleAir.start(now, 0.2, 1.1);

      [0, 0.36].forEach((offset, i) => {
        const heel = ctx.createOscillator();
        const hG = ctx.createGain();
        heel.type = 'sine';
        const t = now + offset;
        heel.frequency.setValueAtTime(110 - i * 12, t);
        heel.frequency.exponentialRampToValueAtTime(36, t + 0.12);
        hG.gain.setValueAtTime(0.22, t);
        hG.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        heel.connect(hG);
        this.routeNode(hG, 0, 0.65);
        heel.start(t);
        heel.stop(t + 0.15);
      });
    } else if (kind === 'alumna') {
      // La Alumna de Tiza: unsettling chalk-on-slate screech + whispered breath
      const chalk = ctx.createBufferSource();
      chalk.buffer = this.pinkBuffer;
      const cBp = ctx.createBiquadFilter();
      cBp.type = 'bandpass';
      cBp.frequency.setValueAtTime(2200, now);
      cBp.frequency.linearRampToValueAtTime(2950, now + 0.45);
      cBp.frequency.linearRampToValueAtTime(1900, now + 0.85);
      cBp.Q.value = 16;
      const cG = ctx.createGain();
      cG.gain.setValueAtTime(0.001, now);
      cG.gain.linearRampToValueAtTime(0.17, now + 0.08);
      cG.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      chalk.connect(cBp);
      cBp.connect(cG);
      this.routeNode(cG, -0.22, 0.72);
      chalk.start(now, 0.1, 0.95);
    } else {
      // La Campana Maldita: echoing dissonant school iron bell toll
      [274, 412, 688, 1045].forEach((freq, idx) => {
        const bell = ctx.createOscillator();
        const g = ctx.createGain();
        bell.type = 'sine';
        bell.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.14 / (idx + 1), now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.35 - idx * 0.15);
        bell.connect(g);
        this.routeNode(g, 0.25, 0.8);
        bell.start(now);
        bell.stop(now + 1.4);
      });
    }
  }

  public playSombraBurnTick(progress: number): void {
    if (!this.ctx || !this.whiteBuffer || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastSombraCueTime < 0.12) return;
    this.lastSombraCueTime = now;

    // Sizzling ember burn + rising pressure hiss
    const sizzle = ctx.createBufferSource();
    sizzle.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + progress * 2400;
    bp.Q.value = 2.6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.065 + progress * 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    sizzle.connect(bp);
    bp.connect(gain);
    this.routeNode(gain, (Math.random() - 0.5) * 0.3, 0.45);
    sizzle.start(now, Math.random() * 0.8, 0.14);
  }

  public playAlumnaHit(remaining: number): void {
    if (!this.ctx || !this.whiteBuffer || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const crack = ctx.createBufferSource();
    crack.buffer = this.whiteBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100 + (3 - remaining) * 420;
    bp.Q.value = 3.0;
    const cG = ctx.createGain();
    cG.gain.setValueAtTime(0.28, now);
    cG.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    crack.connect(bp);
    bp.connect(cG);
    this.routeNode(cG, 0, 0.55);
    crack.start(now, Math.random() * 0.5, 0.16);

    const tone = ctx.createOscillator();
    const tG = ctx.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(940 + (3 - remaining) * 180, now);
    tone.frequency.exponentialRampToValueAtTime(480, now + 0.12);
    tG.gain.setValueAtTime(0.14, now);
    tG.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    tone.connect(tG);
    this.routeNode(tG, 0, 0.5);
    tone.start(now);
    tone.stop(now + 0.15);
  }

  public playPhoneSwipe(): void {
    if (!this.ctx || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const swipe = ctx.createBufferSource();
    swipe.buffer = this.pinkBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600, now);
    bp.frequency.exponentialRampToValueAtTime(3400, now + 0.06);
    bp.Q.value = 4.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.075, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    swipe.connect(bp);
    bp.connect(g);
    this.routeNode(g, 0.15, 0.25);
    swipe.start(now, Math.random() * 0.8, 0.08);
  }

  public playDoorCreak(): void {
    if (!this.ctx || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const latch = ctx.createBufferSource();
    latch.buffer = this.pinkBuffer;
    const lBp = ctx.createBiquadFilter();
    lBp.type = 'bandpass';
    lBp.frequency.value = 1450;
    lBp.Q.value = 3.2;
    const lG = ctx.createGain();
    lG.gain.setValueAtTime(0.2, now);
    lG.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    latch.connect(lBp);
    lBp.connect(lG);
    this.routeNode(lG, 0, 0.45);
    latch.start(now, 0.1, 0.055);

    const creak = ctx.createBufferSource();
    creak.buffer = this.pinkBuffer;
    const cBp = ctx.createBiquadFilter();
    cBp.type = 'bandpass';
    cBp.frequency.setValueAtTime(210, now + 0.06);
    cBp.frequency.linearRampToValueAtTime(310, now + 0.45);
    cBp.frequency.linearRampToValueAtTime(185, now + 0.92);
    cBp.Q.value = 13.0;
    const cG = ctx.createGain();
    cG.gain.setValueAtTime(0.001, now + 0.06);
    cG.gain.linearRampToValueAtTime(0.15, now + 0.22);
    cG.gain.exponentialRampToValueAtTime(0.001, now + 0.96);
    creak.connect(cBp);
    cBp.connect(cG);
    this.routeNode(cG, -0.2, 0.65);
    creak.start(now + 0.06, 0.2, 0.95);
  }

  public playChairSlide(): void {
    if (!this.ctx || !this.pinkBuffer || !this.brownBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Realistic metal-on-linoleum desk chair scrape + muffled cloth rustle
    const scrape = ctx.createBufferSource();
    scrape.buffer = this.pinkBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(340, now);
    bp.frequency.linearRampToValueAtTime(520, now + 0.16);
    bp.frequency.linearRampToValueAtTime(260, now + 0.34);
    bp.Q.value = 9.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    scrape.connect(bp);
    bp.connect(g);
    this.routeNode(g, -0.18, 0.55);
    scrape.start(now, 0.1, 0.4);

    const thud = ctx.createOscillator();
    const tG = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(92, now);
    thud.frequency.exponentialRampToValueAtTime(42, now + 0.14);
    tG.gain.setValueAtTime(0.16, now);
    tG.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    thud.connect(tG);
    this.routeNode(tG, 0, 0.4);
    thud.start(now);
    thud.stop(now + 0.18);
  }

  public playTeacherReplyCue(): void {
    if (!this.ctx || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Calm authoritative double-syllable vocal cadence + subtle chalk tap
    [0, 0.24].forEach((offset, idx) => {
      const voice = ctx.createOscillator();
      voice.type = 'sine';
      const t = now + offset;
      voice.frequency.setValueAtTime(idx === 0 ? 152 : 168, t);
      voice.frequency.linearRampToValueAtTime(idx === 0 ? 142 : 138, t + 0.16);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      voice.connect(g);
      this.routeNode(g, 0.1, 0.65);
      voice.start(t);
      voice.stop(t + 0.2);
    });
  }

  public playAnomalyDefeated(kind: AnomalyKind): void {
    if (!this.ctx || !this.whiteBuffer || !this.pinkBuffer || !this.brownBuffer || this.muted) {
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (kind === 'sombra') {
      // Sub-bass vacuum collapse + dissipating ash wind
      const sub = ctx.createOscillator();
      const sG = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(125, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.42);
      sG.gain.setValueAtTime(0.3, now);
      sG.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
      sub.connect(sG);
      this.routeNode(sG, 0, 0.5);
      sub.start(now);
      sub.stop(now + 0.48);

      const ashWind = ctx.createBufferSource();
      ashWind.buffer = this.pinkBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(340, now);
      bp.frequency.exponentialRampToValueAtTime(2600, now + 0.48);
      bp.Q.value = 1.5;
      const aG = ctx.createGain();
      aG.gain.setValueAtTime(0.28, now);
      aG.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      ashWind.connect(bp);
      bp.connect(aG);
      this.routeNode(aG, 0, 0.65);
      ashWind.start(now, 0, 0.6);
    } else if (kind === 'ojo') {
      // Visceral multi-transient glass & crystal shatter
      [0, 0.02, 0.05, 0.09].forEach((offset, i) => {
        const crack = ctx.createBufferSource();
        crack.buffer = this.whiteBuffer!;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1900 + i * 450;
        const cG = ctx.createGain();
        const t = now + offset;
        cG.gain.setValueAtTime(0.28 - i * 0.04, t);
        cG.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        crack.connect(hp);
        hp.connect(cG);
        this.routeNode(cG, (i - 1.5) * 0.3, 0.72);
        crack.start(t, Math.random() * 0.5, 0.24);
      });

      [1720, 2340, 2980, 1980].forEach((freq, i) => {
        const shard = ctx.createOscillator();
        const g = ctx.createGain();
        shard.type = 'sine';
        const t = now + i * 0.035;
        shard.frequency.setValueAtTime(freq, t);
        shard.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.24);
        g.gain.setValueAtTime(0.085, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
        shard.connect(g);
        this.routeNode(g, (i - 1.5) * 0.35, 0.75);
        shard.start(t);
        shard.stop(t + 0.28);
      });
    } else if (kind === 'figura') {
      // Figura Errante: sharp porcelain snap + hollow retreating rush
      const snap = ctx.createBufferSource();
      snap.buffer = this.whiteBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1850;
      bp.Q.value = 3.2;
      const sG = ctx.createGain();
      sG.gain.setValueAtTime(0.32, now);
      sG.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      snap.connect(bp);
      bp.connect(sG);
      this.routeNode(sG, 0, 0.65);
      snap.start(now, 0, 0.16);

      const rush = ctx.createBufferSource();
      rush.buffer = this.brownBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(950, now);
      lp.frequency.exponentialRampToValueAtTime(140, now + 0.42);
      const rG = ctx.createGain();
      rG.gain.setValueAtTime(0.28, now);
      rG.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      rush.connect(lp);
      lp.connect(rG);
      this.routeNode(rG, 0, 0.5);
      rush.start(now, 0.2, 0.48);
    } else if (kind === 'prefecta') {
      // La Prefecta Sin Rostro: receding cold sigh + distant door slam fade
      const sigh = ctx.createBufferSource();
      sigh.buffer = this.pinkBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(920, now);
      bp.frequency.exponentialRampToValueAtTime(240, now + 0.55);
      bp.Q.value = 2.5;
      const sG = ctx.createGain();
      sG.gain.setValueAtTime(0.24, now);
      sG.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      sigh.connect(bp);
      bp.connect(sG);
      this.routeNode(sG, 0, 0.65);
      sigh.start(now, 0.1, 0.65);
    } else if (kind === 'alumna') {
      // La Alumna de Tiza: shattering chalk-porcelain collapse + dust puff
      [0, 0.04, 0.09].forEach((offset, idx) => {
        const frag = ctx.createBufferSource();
        frag.buffer = this.whiteBuffer!;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 1750 + idx * 380;
        const g = ctx.createGain();
        const t = now + offset;
        g.gain.setValueAtTime(0.26 - idx * 0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        frag.connect(hp);
        hp.connect(g);
        this.routeNode(g, (idx - 1) * 0.25, 0.65);
        frag.start(t, Math.random() * 0.4, 0.2);
      });
    } else {
      // La Campana Maldita: muted iron bell crack & shrapnel burst
      const clang = ctx.createBufferSource();
      clang.buffer = this.whiteBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1600;
      const cG = ctx.createGain();
      cG.gain.setValueAtTime(0.32, now);
      cG.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      clang.connect(hp);
      hp.connect(cG);
      this.routeNode(cG, 0, 0.72);
      clang.start(now, 0, 0.26);

      [320, 510].forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 0.62, now + 0.35);
        g.gain.setValueAtTime(0.16, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.connect(g);
        this.routeNode(g, idx === 0 ? -0.2 : 0.2, 0.7);
        osc.start(now);
        osc.stop(now + 0.4);
      });
    }
  }

  public playJumpscare(kind: AnomalyKind): void {
    if (
      !this.ctx ||
      !this.whiteBuffer ||
      !this.pinkBuffer ||
      !this.brownBuffer ||
      !this.softClipper ||
      this.muted
    ) {
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Universal visceral chest-thump sub-bass impact
    const subImpact = ctx.createOscillator();
    const subGain = ctx.createGain();
    subImpact.type = 'sine';
    subImpact.frequency.setValueAtTime(118, now);
    subImpact.frequency.exponentialRampToValueAtTime(28, now + 0.72);
    subGain.gain.setValueAtTime(0.46, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    subImpact.connect(subGain);
    this.routeNode(subGain, 0, 0.42);
    subImpact.start(now);
    subImpact.stop(now + 0.88);

    const rumble = ctx.createBufferSource();
    rumble.buffer = this.brownBuffer;
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.setValueAtTime(340, now);
    rumbleLp.frequency.exponentialRampToValueAtTime(95, now + 0.85);
    const rGain = ctx.createGain();
    rGain.gain.setValueAtTime(0.42, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + 0.88);
    rumble.connect(rumbleLp);
    rumbleLp.connect(rGain);
    this.routeNode(rGain, 0, 0.45);
    rumble.start(now, 0, 0.9);

    if (kind === 'sombra') {
      // Sombra Acechante: monstrous guttural formant roar + tearing void shriek
      const vocal = ctx.createOscillator();
      vocal.type = 'sawtooth';
      vocal.frequency.setValueAtTime(115, now);
      vocal.frequency.exponentialRampToValueAtTime(64, now + 0.82);

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 31;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 24;
      lfo.connect(lfoGain);
      lfoGain.connect(vocal.frequency);

      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(860, now);
      formant.frequency.exponentialRampToValueAtTime(290, now + 0.8);
      formant.Q.value = 2.6;

      const vGain = ctx.createGain();
      vGain.gain.setValueAtTime(0.32, now);
      vGain.gain.exponentialRampToValueAtTime(0.001, now + 0.86);

      vocal.connect(this.softClipper);
      this.softClipper.connect(formant);
      formant.connect(vGain);
      this.routeNode(vGain, 0, 0.6);
      lfo.start(now);
      vocal.start(now);
      lfo.stop(now + 0.88);
      vocal.stop(now + 0.88);

      // Tearing breathy shriek layer
      const shriek = ctx.createBufferSource();
      shriek.buffer = this.pinkBuffer;
      const sBp = ctx.createBiquadFilter();
      sBp.type = 'bandpass';
      sBp.frequency.setValueAtTime(2100, now);
      sBp.frequency.exponentialRampToValueAtTime(520, now + 0.78);
      sBp.Q.value = 2.2;
      const sG = ctx.createGain();
      sG.gain.setValueAtTime(0.42, now);
      sG.gain.exponentialRampToValueAtTime(0.001, now + 0.82);
      shriek.connect(sBp);
      sBp.connect(sG);
      this.routeNode(sG, 0, 0.65);
      shriek.start(now, 0, 0.85);
    } else if (kind === 'ojo') {
      // Ojo Vigilante: piercing banshee/psychic shriek + violent glass static tear
      const banshee = ctx.createOscillator();
      banshee.type = 'sawtooth';
      banshee.frequency.setValueAtTime(920, now);
      banshee.frequency.exponentialRampToValueAtTime(1920, now + 0.16);
      banshee.frequency.exponentialRampToValueAtTime(640, now + 0.86);

      const fm = ctx.createOscillator();
      fm.type = 'sine';
      fm.frequency.value = 42;
      const fmDepth = ctx.createGain();
      fmDepth.gain.value = 180;
      fm.connect(fmDepth);
      fmDepth.connect(banshee.frequency);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1650, now);
      bp.frequency.exponentialRampToValueAtTime(1050, now + 0.85);
      bp.Q.value = 2.4;

      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(0.26, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.88);
      banshee.connect(bp);
      bp.connect(bGain);
      this.routeNode(bGain, 0, 0.68);
      fm.start(now);
      banshee.start(now);
      fm.stop(now + 0.9);
      banshee.stop(now + 0.9);

      const tear = ctx.createBufferSource();
      tear.buffer = this.whiteBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1850;
      const tG = ctx.createGain();
      tG.gain.setValueAtTime(0.36, now);
      tG.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      tear.connect(hp);
      hp.connect(tG);
      this.routeNode(tG, 0, 0.6);
      tear.start(now, 0.1, 0.6);
    } else if (kind === 'figura') {
      // Figura Errante: visceral dual-formant creature scream + frantic wooden/porcelain clatter
      [340, 495].forEach((baseF, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(baseF, now);
        osc.frequency.exponentialRampToValueAtTime(baseF * 2.1, now + 0.11);
        osc.frequency.exponentialRampToValueAtTime(baseF * 0.72, now + 0.84);

        const wob = ctx.createOscillator();
        wob.type = 'sine';
        wob.frequency.value = 36 + idx * 9;
        const wD = ctx.createGain();
        wD.gain.value = 48;
        wob.connect(wD);
        wD.connect(osc.frequency);

        const formant = ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.value = 1320 + idx * 520;
        formant.Q.value = 2.8;

        const oG = ctx.createGain();
        oG.gain.setValueAtTime(0.24, now);
        oG.gain.exponentialRampToValueAtTime(0.001, now + 0.88);
        osc.connect(formant);
        formant.connect(oG);
        this.routeNode(oG, idx === 0 ? -0.18 : 0.18, 0.65);
        wob.start(now);
        osc.start(now);
        wob.stop(now + 0.9);
        osc.stop(now + 0.9);
      });

      // Rapid wooden & porcelain jaw/joint impacts
      [0, 0.07, 0.14, 0.22, 0.31].forEach((offset, idx) => {
        const clack = ctx.createBufferSource();
        clack.buffer = this.whiteBuffer!;
        const cBp = ctx.createBiquadFilter();
        cBp.type = 'bandpass';
        cBp.frequency.value = 1900 + idx * 140;
        cBp.Q.value = 3.5;
        const cG = ctx.createGain();
        const t = now + offset;
        cG.gain.setValueAtTime(0.3, t);
        cG.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
        clack.connect(cBp);
        cBp.connect(cG);
        this.routeNode(cG, (idx % 2 === 0 ? -1 : 1) * 0.25, 0.5);
        clack.start(t, Math.random() * 0.5, 0.065);
      });
    } else if (kind === 'prefecta') {
      // La Prefecta Sin Rostro: ear-splitting shrill monitor whistle + suffocating vocal screech
      const screech = ctx.createOscillator();
      screech.type = 'sawtooth';
      screech.frequency.setValueAtTime(1480, now);
      screech.frequency.exponentialRampToValueAtTime(2150, now + 0.18);
      screech.frequency.exponentialRampToValueAtTime(980, now + 0.85);

      const fm = ctx.createOscillator();
      fm.type = 'sine';
      fm.frequency.value = 54;
      const fmD = ctx.createGain();
      fmD.gain.value = 210;
      fm.connect(fmD);
      fmD.connect(screech.frequency);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1950;
      bp.Q.value = 3.2;

      const sG = ctx.createGain();
      sG.gain.setValueAtTime(0.28, now);
      sG.gain.exponentialRampToValueAtTime(0.001, now + 0.88);
      screech.connect(this.softClipper);
      this.softClipper.connect(bp);
      bp.connect(sG);
      this.routeNode(sG, 0, 0.72);
      fm.start(now);
      screech.start(now);
      fm.stop(now + 0.9);
      screech.stop(now + 0.9);
    } else if (kind === 'alumna') {
      // La Alumna de Tiza: piercing chalk-slate screech + frantic porcelain shrieks
      const shriek = ctx.createBufferSource();
      shriek.buffer = this.whiteBuffer;
      const sBp = ctx.createBiquadFilter();
      sBp.type = 'bandpass';
      sBp.frequency.setValueAtTime(2800, now);
      sBp.frequency.linearRampToValueAtTime(1750, now + 0.8);
      sBp.Q.value = 4.6;
      const sG = ctx.createGain();
      sG.gain.setValueAtTime(0.38, now);
      sG.gain.exponentialRampToValueAtTime(0.001, now + 0.86);
      shriek.connect(sBp);
      sBp.connect(sG);
      this.routeNode(sG, 0, 0.72);
      shriek.start(now, 0, 0.88);

      [520, 745].forEach((baseF, idx) => {
        const v = ctx.createOscillator();
        v.type = 'sawtooth';
        v.frequency.setValueAtTime(baseF, now);
        v.frequency.exponentialRampToValueAtTime(baseF * 1.9, now + 0.14);
        v.frequency.exponentialRampToValueAtTime(baseF * 0.65, now + 0.82);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1650 + idx * 450;
        f.Q.value = 2.6;
        const vG = ctx.createGain();
        vG.gain.setValueAtTime(0.22, now);
        vG.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
        v.connect(f);
        f.connect(vG);
        this.routeNode(vG, idx === 0 ? -0.2 : 0.2, 0.65);
        v.start(now);
        v.stop(now + 0.88);
      });
    } else {
      // La Campana Maldita: deafening dissonant iron bell clang + metallic surge
      [268, 405, 682, 1120, 1580].forEach((freq, idx) => {
        const bell = ctx.createOscillator();
        bell.type = idx % 2 === 0 ? 'sawtooth' : 'sine';
        bell.frequency.setValueAtTime(freq, now);
        bell.frequency.exponentialRampToValueAtTime(freq * 0.94, now + 0.85);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq;
        bp.Q.value = 2.0;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.22 / (idx * 0.45 + 1), now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.92);
        bell.connect(bp);
        bp.connect(g);
        this.routeNode(g, (idx - 2) * 0.15, 0.78);
        bell.start(now);
        bell.stop(now + 0.95);
      });

      const clash = ctx.createBufferSource();
      clash.buffer = this.whiteBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      const cG = ctx.createGain();
      cG.gain.setValueAtTime(0.38, now);
      cG.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      clash.connect(hp);
      hp.connect(cG);
      this.routeNode(cG, 0, 0.65);
      clash.start(now, 0, 0.6);
    }
  }

  public playIntroSwell(): void {
    if (!this.ctx || !this.brownBuffer || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Deep atmospheric sub-bass dread swell rising into gameplay
    const sub = ctx.createOscillator();
    const sGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(36.71, now); // D1
    sub.frequency.linearRampToValueAtTime(55.0, now + 2.6); // A1 tension
    sGain.gain.setValueAtTime(0.001, now);
    sGain.gain.linearRampToValueAtTime(0.24, now + 1.4);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 2.95);
    sub.connect(sGain);
    this.routeNode(sGain, 0, 0.55);
    sub.start(now);
    sub.stop(now + 3.0);

    // Cold threshold draft sweeping through the entrance
    const draft = ctx.createBufferSource();
    draft.buffer = this.pinkBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(190, now);
    bp.frequency.exponentialRampToValueAtTime(540, now + 2.2);
    bp.frequency.exponentialRampToValueAtTime(220, now + 2.95);
    bp.Q.value = 2.4;

    const dGain = ctx.createGain();
    dGain.gain.setValueAtTime(0.001, now);
    dGain.gain.linearRampToValueAtTime(0.14, now + 1.0);
    dGain.gain.exponentialRampToValueAtTime(0.001, now + 2.95);
    draft.connect(bp);
    bp.connect(dGain);
    this.routeNode(dGain, 0, 0.72);
    draft.start(now, 0.1, 3.0);
  }

  public playVictory(): void {
    if (!this.ctx || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Warm cinematic relief pad (soft sine swells + distant exhale breeze)
    const chord = [196.0, 246.94, 293.66, 392.0];
    chord.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.09;
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.24);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      osc.connect(g);
      this.routeNode(g, (idx - 1.5) * 0.22, 0.72);
      osc.start(t);
      osc.stop(t + 1.85);
    });
  }

  public playDefeat(): void {
    if (!this.ctx || !this.brownBuffer || !this.pinkBuffer || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Oppressive battery power-down + dark sub boom
    const sub = ctx.createOscillator();
    const sG = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(92, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 1.2);
    sG.gain.setValueAtTime(0.38, now);
    sG.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
    sub.connect(sG);
    this.routeNode(sG, 0, 0.65);
    sub.start(now);
    sub.stop(now + 1.35);

    const wind = ctx.createBufferSource();
    wind.buffer = this.brownBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(620, now);
    lp.frequency.exponentialRampToValueAtTime(90, now + 1.15);
    const wG = ctx.createGain();
    wG.gain.setValueAtTime(0.32, now);
    wG.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    wind.connect(lp);
    lp.connect(wG);
    this.routeNode(wG, 0, 0.6);
    wind.start(now, 0, 1.25);
  }

  public dispose(): void {
    try {
      this.humOsc60?.stop();
      this.humOsc120?.stop();
      this.humLfo?.stop();
      this.roomNoiseSource?.stop();
      this.humNoiseSource?.stop();
      this.musicPadOsc1?.stop();
      this.musicPadOsc2?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
  }
}
