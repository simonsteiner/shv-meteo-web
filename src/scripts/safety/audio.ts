// The vario simulator's sound through the Web Audio API. Browsers only let
// audio start from a click, so the page creates the context on the first
// "sound on". The tone for each rate comes from `varioTone` (vario.ts).

import { varioTone } from "./vario.ts";

type AudioContextClass = new () => AudioContext;

function audioContextClass(): AudioContextClass | null {
  const g = globalThis as unknown as {
    AudioContext?: AudioContextClass;
    webkitAudioContext?: AudioContextClass;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

const BEEP_GAIN = 0.25;
const BEEP_ATTACK_S = 0.015;
const DRONE_GAIN = 0.18;

export class VarioAudio {
  private ctx: AudioContext | null = null;
  private drone: OscillatorNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private playing = false;
  private rate = 0;

  /** Starts the sound at `rate` m/s; false when the browser has no Web
   * Audio. */
  start(rate: number): boolean {
    if (!this.ensureContext()) return false;
    this.playing = true;
    this.rate = rate;
    this.play();
    return true;
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.playing) this.play();
  }

  stop(): void {
    this.playing = false;
    this.silence();
  }

  private ensureContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const Ctx = audioContextClass();
        if (!Ctx) {
          console.error("[VarioAudio] This browser has no Web Audio API");
          return null;
        }
        this.ctx = new Ctx();
      }
      if (this.ctx.state === "suspended")
        this.ctx.resume().catch((err: unknown) => {
          console.error("[VarioAudio] Cannot resume the audio context:", err);
        });
      return this.ctx;
    } catch (err) {
      console.error("[VarioAudio] Cannot create the audio context:", err);
      return null;
    }
  }

  private silence(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.drone) {
      try {
        this.drone.stop();
        this.drone.disconnect();
      } catch (err) {
        console.error("[VarioAudio] Cannot stop the drone:", err);
      }
      this.drone = null;
    }
  }

  private play(): void {
    this.silence();
    const ctx = this.ctx;
    if (!this.playing || !ctx) return;
    const tone = varioTone(this.rate);
    if (tone.kind === "beep") {
      const beep = () => this.beep(ctx, tone.frequency, tone.beepMs / 1000);
      beep();
      this.timer = setInterval(beep, tone.cycleMs);
    } else if (tone.kind === "drone") {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(tone.frequency, ctx.currentTime);
        gain.gain.setValueAtTime(DRONE_GAIN, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        this.drone = osc;
      } catch (err) {
        console.error("[VarioAudio] Cannot start the drone:", err);
      }
    }
  }

  /** One short sine chirp: a fast attack, then a linear fade. */
  private beep(ctx: AudioContext, frequency: number, seconds: number): void {
    if (!this.playing) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(BEEP_GAIN, now + BEEP_ATTACK_S);
      gain.gain.linearRampToValueAtTime(0, now + seconds);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(now + seconds + 0.02);
    } catch (err) {
      console.error("[VarioAudio] Cannot play a beep:", err);
    }
  }
}
