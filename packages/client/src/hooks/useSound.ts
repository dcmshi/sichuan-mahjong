import { useCallback, useRef } from 'react';
import { useStore } from '../store/index.js';

type SoundType = 'tile' | 'discard' | 'kong' | 'hu' | 'claim';

function createCtx(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = createCtx();
  return sharedCtx;
}

function resumeCtx(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') return ctx.resume();
  return Promise.resolve();
}

// Synthesised sounds using Web Audio API — no external audio files needed

function playTileClick(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(900, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.08);
}

function playDiscard(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(500, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.12);
}

function playKong(ctx: AudioContext) {
  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 700 + i * 50;
    gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.1);
    osc.start(ctx.currentTime + i * 0.07);
    osc.stop(ctx.currentTime + i * 0.07 + 0.1);
  }
}

function playHu(ctx: AudioContext) {
  const freqs = [523, 659, 784, 1047];
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.1 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
    osc.start(ctx.currentTime + i * 0.1);
    osc.stop(ctx.currentTime + i * 0.1 + 0.3);
  });
}

function playClaim(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

export function useSound() {
  const enabled = useStore(s => s.soundEnabled);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const play = useCallback((type: SoundType) => {
    if (!enabledRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    void resumeCtx(ctx).then(() => {
      switch (type) {
        case 'tile':
          playTileClick(ctx);
          break;
        case 'discard':
          playDiscard(ctx);
          break;
        case 'kong':
          playKong(ctx);
          break;
        case 'hu':
          playHu(ctx);
          break;
        case 'claim':
          playClaim(ctx);
          break;
      }
    });
  }, []);

  return play;
}
