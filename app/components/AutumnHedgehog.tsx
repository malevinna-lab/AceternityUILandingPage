"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LeafShape = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) => void;

interface Leaf {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  shape: LeafShape;
  layer: number; // 0 back … 2 front (hedgehog sits in 1)
  flutter: number;
  depth: number; // parallax factor of cursor push
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: "spark" | "leafbit";
  rot: number;
  vrot: number;
}

/* ------------------------------------------------------------------ */
/*  Watercolour palette                                                */
/* ------------------------------------------------------------------ */

const LEAF_COLORS = [
  "#c98a3d", // ochre
  "#b8642f", // terracotta
  "#8f5a2a", // umber
  "#d9a441", // gold
  "#a6752c", // dark amber
  "#7c6b32", // olive gold
  "#9c3f26", // burnt red
  "#5c6e3a", // deep green
  "#48582f", // pine
  "#e0b45c", // light gold
];

const BG_TOP = "#2c3323";
const BG_BOTTOM = "#4a3520";

/* ------------------------------------------------------------------ */
/*  Leaf shapes (canvas paths, drawn centred)                          */
/* ------------------------------------------------------------------ */

const maple: LeafShape = (ctx, w, h) => {
  const s = w / 2;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.1);
  ctx.lineTo(s * 0.28, -s * 0.45);
  ctx.lineTo(s * 0.95, -s * 0.62);
  ctx.lineTo(s * 0.62, -s * 0.08);
  ctx.lineTo(s * 1.05, s * 0.32);
  ctx.lineTo(s * 0.42, s * 0.3);
  ctx.lineTo(s * 0.5, s * 0.95);
  ctx.lineTo(s * 0.08, s * 0.62);
  ctx.lineTo(-s * 0.08, s * 0.62);
  ctx.lineTo(-s * 0.5, s * 0.95);
  ctx.lineTo(-s * 0.42, s * 0.3);
  ctx.lineTo(-s * 1.05, s * 0.32);
  ctx.lineTo(-s * 0.62, -s * 0.08);
  ctx.lineTo(-s * 0.95, -s * 0.62);
  ctx.lineTo(-s * 0.28, -s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(60,35,10,0.35)";
  ctx.lineWidth = Math.max(0.6, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.lineTo(0, -s * 0.9);
  ctx.moveTo(0, 0);
  ctx.lineTo(s * 0.75, -s * 0.4);
  ctx.moveTo(0, 0);
  ctx.lineTo(-s * 0.75, -s * 0.4);
  ctx.stroke();
};

const oval: LeafShape = (ctx, w, h) => {
  const sx = w / 2;
  const sy = h / 2;
  ctx.beginPath();
  ctx.moveTo(0, -sy);
  ctx.bezierCurveTo(sx, -sy * 0.55, sx, sy * 0.55, 0, sy);
  ctx.bezierCurveTo(-sx, sy * 0.55, -sx, -sy * 0.55, 0, -sy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(60,35,10,0.3)";
  ctx.lineWidth = Math.max(0.6, sx * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, -sy * 0.85);
  ctx.lineTo(0, sy * 0.9);
  ctx.stroke();
};

const oak: LeafShape = (ctx, w) => {
  const s = w / 2;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  for (let i = 0; i < 5; i++) {
    const t = -1 + i * 0.4;
    const bulge = 0.55 + 0.4 * Math.sin((i + 1) * 1.1);
    ctx.quadraticCurveTo(s * bulge * 1.35, s * (t + 0.2), s * 0.5, s * (t + 0.4));
  }
  ctx.lineTo(0, s);
  for (let i = 4; i >= 0; i--) {
    const t = -1 + i * 0.4;
    const bulge = 0.55 + 0.4 * Math.sin((i + 1) * 1.1);
    ctx.quadraticCurveTo(-s * bulge * 1.35, s * (t + 0.2), -s * 0.5, s * (t + 0.4));
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(60,35,10,0.3)";
  ctx.lineWidth = Math.max(0.6, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.9);
  ctx.lineTo(0, s * 0.95);
  ctx.stroke();
};

const birch: LeafShape = (ctx, w, h) => {
  const sx = w / 2;
  const sy = h / 2;
  ctx.beginPath();
  ctx.moveTo(0, -sy);
  ctx.quadraticCurveTo(sx * 1.1, -sy * 0.1, sx * 0.25, sy);
  ctx.lineTo(-sx * 0.25, sy);
  ctx.quadraticCurveTo(-sx * 1.1, -sy * 0.1, 0, -sy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(60,35,10,0.28)";
  ctx.lineWidth = Math.max(0.5, sx * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, -sy * 0.85);
  ctx.lineTo(0, sy * 0.9);
  ctx.moveTo(0, -sy * 0.2);
  ctx.lineTo(sx * 0.5, sy * 0.15);
  ctx.moveTo(0, -sy * 0.2);
  ctx.lineTo(-sx * 0.5, sy * 0.15);
  ctx.stroke();
};

const SHAPES: LeafShape[] = [maple, oval, oak, birch];

/* ------------------------------------------------------------------ */
/*  Sound engine (WebAudio synthesis — no external files)              */
/* ------------------------------------------------------------------ */

class HedgehogSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambNodes: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      // shared white-noise buffer
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  /* dry leaves rustle */
  rustle(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800 + Math.random() * 2200;
    bp.Q.value = 0.8;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const vol = Math.min(0.22, 0.05 + 0.09 * intensity);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16 + Math.random() * 0.1);
    src.connect(bp).connect(hp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.3);
  }

  /* tiny sleeping snuffle — soft filtered noise with pitch wobble */
  snuffle() {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    const t = ctx.currentTime;
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.linearRampToValueAtTime(700, t + 0.12);
    lp.frequency.linearRampToValueAtTime(300, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.3);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.35);
  }

  /* comedic "pff-choo!" — airy burst + descending blip */
  sneeze() {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf || !this.master) return;
    const t = ctx.currentTime;
    // air burst
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.09);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
    // cute low "pff" blip
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.001, t);
    og.gain.linearRampToValueAtTime(0.07, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /* cosy blanket whoosh when covering the hedgehog */
  cover() {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    const t = ctx.currentTime;
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 0.5);
    lp.frequency.linearRampToValueAtTime(400, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1.4);
  }

  /* gentle fireplace crackles */
  crackle() {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf || !this.master) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.4;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2200 + Math.random() * 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.02, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.05);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.12);
  }

  startAmbience(kind: "fire" | "rain") {
    const ctx = this.ensure();
    if (!ctx || !this.noiseBuf || !this.master) return;
    this.stopAmbience();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    const g = ctx.createGain();
    if (kind === "fire") {
      lp.frequency.value = 480;
      g.gain.value = 0.05;
    } else {
      lp.frequency.value = 3200;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 500;
      src.disconnect();
      src.connect(hp).connect(lp);
    }
    if (kind === "rain") g.gain.value = 0.035;
    // slow breathing LFO on volume
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = g.gain.value * 0.4;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    this.ambNodes.push({ src, gain: g });
    this.ambNodes.push({ src: lfo as unknown as AudioBufferSourceNode, gain: lfoGain as unknown as GainNode });
  }

  stopAmbience() {
    for (const n of this.ambNodes) {
      try {
        n.src.stop();
      } catch {
        /* already stopped */
      }
      try {
        n.src.disconnect();
        n.gain.disconnect();
      } catch {
        /* noop */
      }
    }
    this.ambNodes = [];
  }

  dispose() {
    this.stopAmbience();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
  }
}

/* ------------------------------------------------------------------ */
/*  Hedgehog drawing (vector watercolour style)                        */
/* ------------------------------------------------------------------ */

interface HedgehogState {
  breath: number; // 0..1 breathing cycle value
  noseTwitch: number; // decays after discovery
  sneezeT: number; // >0 while sneezing animation plays
  awake: boolean;
  petGlow: number;
}

function drawHedgehog(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  st: HedgehogState,
) {
  const breathe = 1 + Math.sin(st.breath * Math.PI * 2) * 0.018;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(breathe, 1 / breathe);

  /* ---- shadow under the ball ---- */
  ctx.beginPath();
  ctx.ellipse(0, R * 0.92, R * 1.05, R * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(30,20,8,0.35)";
  ctx.filter = "blur(6px)";
  ctx.fill();
  ctx.filter = "none";

  /* ---- spines: radial soft-dark spikes over the top 3/4 ---- */
  const spikeCount = 46;
  for (let ring = 2; ring >= 0; ring--) {
    const rr = R * (1.0 - ring * 0.06);
    ctx.beginPath();
    for (let i = 0; i <= spikeCount; i++) {
      const a = Math.PI * 0.78 + (i / spikeCount) * Math.PI * 1.55; // around the back
      const jag = i % 2 === 0 ? rr * 1.16 : rr * 0.97;
      const x = Math.cos(a) * jag;
      const y = Math.sin(a) * jag;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // close along the belly
    ctx.quadraticCurveTo(R * 0.4, R * 0.85, R * 0.1, R * 0.9);
    ctx.quadraticCurveTo(-R * 0.6, R * 0.95, -R * 0.9, R * 0.35);
    ctx.closePath();
    const grad = ctx.createRadialGradient(0, -R * 0.2, R * 0.2, 0, 0, R * 1.2);
    if (ring === 2) {
      grad.addColorStop(0, "#4a3a28");
      grad.addColorStop(1, "#2e2317");
    } else if (ring === 1) {
      grad.addColorStop(0, "#6b5638");
      grad.addColorStop(1, "#3d2f1e");
    } else {
      grad.addColorStop(0, "#8a7048");
      grad.addColorStop(1, "#4c3a24");
    }
    ctx.fillStyle = grad;
    ctx.globalAlpha = ring === 2 ? 1 : 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* spine highlights — warm tips */
  ctx.strokeStyle = "rgba(214,178,120,0.5)";
  ctx.lineWidth = R * 0.02;
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * 0.85 + (i / 17) * Math.PI * 1.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7);
    ctx.lineTo(Math.cos(a) * R * 1.1, Math.sin(a) * R * 1.1);
    ctx.stroke();
  }

  /* ---- face wedge (lower-right of the ball) ---- */
  const faceX = R * 0.42;
  const faceY = R * 0.38;
  ctx.save();
  ctx.translate(faceX, faceY);
  ctx.rotate(-0.18);

  // fluffy cheek/body of face
  ctx.beginPath();
  ctx.moveTo(-R * 0.55, -R * 0.1);
  ctx.quadraticCurveTo(-R * 0.2, -R * 0.5, R * 0.35, -R * 0.32);
  ctx.quadraticCurveTo(R * 0.72, -R * 0.1, R * 0.62, R * 0.3);
  ctx.quadraticCurveTo(R * 0.3, R * 0.62, -R * 0.2, R * 0.5);
  ctx.quadraticCurveTo(-R * 0.6, R * 0.3, -R * 0.55, -R * 0.1);
  ctx.closePath();
  const furGrad = ctx.createLinearGradient(0, -R * 0.4, 0, R * 0.5);
  furGrad.addColorStop(0, "#d9bd93");
  furGrad.addColorStop(1, "#b3915f");
  ctx.fillStyle = furGrad;
  ctx.fill();

  // little paw tucked under chin
  ctx.beginPath();
  ctx.ellipse(R * 0.18, R * 0.42, R * 0.14, R * 0.09, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "#c8a876";
  ctx.fill();
  ctx.strokeStyle = "rgba(90,60,30,0.35)";
  ctx.lineWidth = R * 0.015;
  ctx.stroke();

  // ear
  ctx.beginPath();
  ctx.ellipse(-R * 0.05, -R * 0.34, R * 0.1, R * 0.08, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "#a5855a";
  ctx.fill();

  /* eyes: closed happy arcs (open during/after sneeze) */
  const eyeY = -R * 0.05;
  const sneezePhase = st.sneezeT; // 0..1 remaining
  const eyesOpen =
    st.awake && (sneezePhase > 0.55 || (st.petGlow > 0.4 && sneezePhase === 0));
  const blinkSquint = sneezePhase > 0.75 ? 0.2 : 1; // scrunched right before choo
  for (const ex of [-R * 0.12, R * 0.2]) {
    if (eyesOpen && sneezePhase <= 0.75) {
      ctx.beginPath();
      ctx.arc(ex, eyeY, R * 0.05 * blinkSquint + R * 0.015, 0, Math.PI * 2);
      ctx.fillStyle = "#241a10";
      ctx.fill();
      // twinkle
      ctx.beginPath();
      ctx.arc(ex + R * 0.015, eyeY - R * 0.015, R * 0.012, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,250,235,0.9)";
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.strokeStyle = "#241a10";
      ctx.lineWidth = R * 0.028;
      ctx.lineCap = "round";
      const squiggle = st.noseTwitch > 0 ? Math.sin(Date.now() / 60) * R * 0.008 : 0;
      ctx.arc(ex, eyeY + R * 0.02 + squiggle, R * 0.06, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
  }

  // blush
  ctx.beginPath();
  ctx.ellipse(-R * 0.2, R * 0.14, R * 0.09, R * 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(205,120,90,0.35)";
  ctx.fill();

  /* muzzle + nose (the petting target) */
  const twitch = st.noseTwitch * Math.sin(Date.now() / 45) * R * 0.03;
  const scrunch = sneezePhase > 0.7 ? R * 0.06 : 0; // pulls in before sneeze
  const nx = R * 0.56 - scrunch + twitch;
  const ny = R * 0.12 + scrunch * 0.5;

  ctx.beginPath();
  ctx.moveTo(R * 0.1, -R * 0.02);
  ctx.quadraticCurveTo(R * 0.45, -R * 0.12, nx, ny - R * 0.02);
  ctx.quadraticCurveTo(R * 0.4, R * 0.3, R * 0.08, R * 0.22);
  ctx.closePath();
  ctx.fillStyle = "#e3cba0";
  ctx.fill();

  // nose itself
  ctx.beginPath();
  ctx.ellipse(nx, ny, R * 0.075, R * 0.06, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = "#2c2018";
  ctx.fill();
  // wet shine
  ctx.beginPath();
  ctx.ellipse(nx - R * 0.02, ny - R * 0.02, R * 0.025, R * 0.015, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fill();

  // tiny mouth
  ctx.beginPath();
  ctx.strokeStyle = "rgba(60,40,20,0.6)";
  ctx.lineWidth = R * 0.02;
  ctx.lineCap = "round";
  if (sneezePhase > 0.4 && sneezePhase <= 0.75) {
    ctx.arc(nx - R * 0.02, ny + R * 0.14, R * 0.05, 0, Math.PI * 2); // open "choo" mouth
    ctx.fillStyle = "rgba(120,50,40,0.8)";
    ctx.fill();
  } else {
    ctx.moveTo(nx - R * 0.08, ny + R * 0.13);
    ctx.quadraticCurveTo(nx - R * 0.02, ny + R * 0.18, nx + R * 0.04, ny + R * 0.13);
    ctx.stroke();
  }

  /* zzz / sniff marks above head when asleep & near */
  ctx.restore();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AutumnHedgehog() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundRef = useRef<HedgehogSound | null>(null);
  if (!soundRef.current) soundRef.current = new HedgehogSound();

  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ambience, setAmbience] = useState<"fire" | "rain">("fire");
  const [found, setFound] = useState(false);
  const [petted, setPetted] = useState(false);
  const [sneezes, setSneezes] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [hoverNose, setHoverNose] = useState(false);
  const [coverHint, setCoverHint] = useState(false);

  const stateRef = useRef({
    found: false,
    petted: false,
    covered: false,
    sneezePending: 0,
    hoverNose: false,
  });
  stateRef.current.found = found;
  stateRef.current.petted = petted;

  /* keep refs for values used inside the RAF loop */
  const ambienceRef = useRef(ambience);
  ambienceRef.current = ambience;

  const start = useCallback(() => {
    const s = soundRef.current!;
    s.setMuted(muted);
    s.startAmbience(ambienceRef.current);
    setStarted(true);
  }, [muted]);

  useEffect(() => {
    soundRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (started) soundRef.current?.startAmbience(ambience);
  }, [ambience, started]);

  useEffect(() => {
    return () => soundRef.current?.dispose();
  }, []);

  /* ------------------------- main scene --------------------------- */
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let running = true;

    const leaves: Leaf[] = [];
    const particles: Particle[] = [];
    const motes: { x: number; y: number; r: number; p: number; s: number }[] = [];

    const mouse = { x: -9999, y: -9999, px: -9999, py: -9999, down: false };
    const hedge = { x: 0, y: 0, R: 0 };
    const hst: HedgehogState = {
      breath: 0,
      noseTwitch: 0,
      sneezeT: 0,
      awake: false,
      petGlow: 0,
    };

    function layout() {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      hedge.R = Math.min(W, H) * 0.11;
      hedge.x = W * (0.28 + Math.random() * 0.44);
      hedge.y = H * (0.34 + Math.random() * 0.3);
    }

    function makeLeaf(layer: number): Leaf {
      const size = (layer === 0 ? 26 : layer === 1 ? 34 : 44) * (0.7 + Math.random() * 0.7);
      const x = Math.random() * W;
      const y = Math.random() * H;
      return {
        x,
        y,
        homeX: x,
        homeY: y,
        vx: 0,
        vy: 0,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.02,
        size,
        color: LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0],
        shape: SHAPES[(Math.random() * SHAPES.length) | 0],
        layer,
        flutter: Math.random() * Math.PI * 2,
        depth: layer === 0 ? 0.55 : layer === 1 ? 0.85 : 1.15,
      };
    }

    function seedLeaves() {
      leaves.length = 0;
      const density = Math.round((W * H) / 9000);
      const counts = [density, Math.round(density * 1.1), Math.round(density * 0.9)];
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < counts[layer]; i++) {
          leaves.push(makeLeaf(layer));
        }
      }
      // guarantee a thick pile directly over the hedgehog
      for (let i = 0; i < 60; i++) {
        const l = makeLeaf(2);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * hedge.R * 1.9;
        l.x = hedge.x + Math.cos(a) * r;
        l.y = hedge.y + Math.sin(a) * r * 0.8;
        l.homeX = l.x;
        l.homeY = l.y;
        leaves.push(l);
      }
      if (stateRef.current.found) {
        // keep the den open after resize: push home positions off his body
        for (const l of leaves) {
          const d = Math.hypot(l.homeX - hedge.x, l.homeY - hedge.y);
          if (d < hedge.R * 1.4) {
            const a = Math.atan2(l.homeY - hedge.y, l.homeX - hedge.x);
            l.homeX = hedge.x + Math.cos(a) * hedge.R * 1.9;
            l.homeY = hedge.y + Math.sin(a) * hedge.R * 1.9;
            l.x = l.homeX;
            l.y = l.homeY;
          }
        }
      }
      motes.length = 0;
      for (let i = 0; i < 40; i++) {
        motes.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 0.6 + Math.random() * 1.8,
          p: Math.random() * Math.PI * 2,
          s: 0.1 + Math.random() * 0.25,
        });
      }
    }

    layout();
    seedLeaves();

    /* ---------- interaction helpers ---------- */

    function distToNose(x: number, y: number) {
      // nose position in world coords (face wedge lower-right of ball)
      const nx = hedge.x + hedge.R * 0.42 + Math.cos(-0.18) * hedge.R * 0.56;
      const ny = hedge.y + hedge.R * 0.38 + Math.sin(-0.18) * hedge.R * 0.56 + hedge.R * 0.12;
      return Math.hypot(x - nx, y - ny);
    }

    function spawnParticles(x: number, y: number, kind: Particle["kind"], n: number) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = kind === "spark" ? 1 + Math.random() * 3.5 : 0.6 + Math.random() * 2;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (kind === "leafbit" ? 1.5 : 0.8),
          life: 0,
          maxLife: 50 + Math.random() * 40,
          size: kind === "spark" ? 1.5 + Math.random() * 2.5 : 4 + Math.random() * 5,
          color:
            kind === "spark"
              ? ["#ffd984", "#ffb85c", "#fff2c4"][(Math.random() * 3) | 0]
              : LEAF_COLORS[(Math.random() * LEAF_COLORS.length) | 0],
          kind,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.2,
        });
      }
    }

    function doSneeze() {
      const s = soundRef.current!;
      hst.sneezeT = 1;
      s.sneeze();
      const nx = hedge.x + hedge.R * 0.95;
      const ny = hedge.y + hedge.R * 0.5;
      spawnParticles(nx, ny, "spark", 16);
      spawnParticles(nx, ny, "leafbit", 3);
      setSneezes((v) => {
        const nv = v + 1;
        if (nv >= 3) setTimeout(() => setShowForm(true), 900);
        return nv;
      });
      // blow nearby leaves away
      for (const l of leaves) {
        const dx = l.x - nx;
        const dy = l.y - ny;
        const d = Math.hypot(dx, dy);
        if (d < hedge.R * 4) {
          const f = (1 - d / (hedge.R * 4)) * 9;
          l.vx += (dx / (d || 1)) * f;
          l.vy += (dy / (d || 1)) * f - 2;
        }
      }
    }

    function tryDiscover(x: number, y: number) {
      if (stateRef.current.found) return;
      // how much of the pile over the hedgehog has been raked away?
      let cleared = 0;
      for (const l of leaves) {
        if (l.layer < 1) continue;
        const dh = Math.hypot(l.homeX - hedge.x, l.homeY - hedge.y);
        if (dh > hedge.R * 1.35) continue; // this leaf originally covered him
        const dcur = Math.hypot(l.x - hedge.x, l.y - hedge.y);
        if (dcur > hedge.R * 1.25) cleared++; // ...but now it sits outside the den
      }
      const nearCursor = Math.hypot(x - hedge.x, y - hedge.y) < hedge.R * 2.2;
      if (nearCursor && cleared >= 45) {
        stateRef.current.found = true;
        hst.awake = true;
        hst.noseTwitch = 1;
        setFound(true);
        const s = soundRef.current!;
        s.snuffle();
        setTimeout(() => s.snuffle(), 700);
      }
    }

    /* ---------- pointer events ---------- */

    function onMove(e: PointerEvent) {
      mouse.px = mouse.x;
      mouse.py = mouse.y;
      mouse.x = e.clientX;
      mouse.y = e.clientY;

      if (!stateRef.current.found) tryDiscover(mouse.x, mouse.y);

      // raking near the tucked-in den re-opens it
      if (stateRef.current.covered) {
        const d = Math.hypot(mouse.x - hedge.x, mouse.y - hedge.y);
        if (d < hedge.R * 2 && Math.hypot(mouse.x - mouse.px, mouse.y - mouse.py) > 2) {
          stateRef.current.covered = false;
          soundRef.current?.rustle(0.7);
        }
      }

      const nd = distToNose(mouse.x, mouse.y);
      const wasHover = stateRef.current.hoverNose;
      stateRef.current.hoverNose =
        stateRef.current.found && !stateRef.current.covered && nd < hedge.R * 0.35;
      if (wasHover !== stateRef.current.hoverNose) setHoverNose(stateRef.current.hoverNose);
    }

    let lastRustle = 0;
    function onDown(e: PointerEvent) {
      mouse.down = true;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!stateRef.current.found) tryDiscover(mouse.x, mouse.y);
      if (
        stateRef.current.found &&
        !stateRef.current.covered &&
        distToNose(mouse.x, mouse.y) < hedge.R * 0.4
      ) {
        petNose();
      }
    }
    function onUp() {
      mouse.down = false;
    }

    let petStrokes = 0;
    let petReset: ReturnType<typeof setTimeout> | null = null;
    function petNose() {
      const s = soundRef.current!;
      hst.petGlow = 1;
      hst.noseTwitch = Math.max(hst.noseTwitch, 0.6);
      s.rustle(0.4);
      petStrokes++;
      if (petReset) clearTimeout(petReset);
      petReset = setTimeout(() => (petStrokes = 0), 1600);
      if (petStrokes >= 3) {
        petStrokes = 0;
        stateRef.current.petted = true;
        setPetted(true);
        doSneeze();
      }
    }

    function coverHedgehog() {
      if (coverAnim.active) return;
      const s = soundRef.current!;
      s.cover();
      coverAnim.active = true;
      coverAnim.t = 0;
      stateRef.current.covered = true; // leaves settle over the den
      setCoverHint(true);
      setTimeout(() => setCoverHint(false), 2600);
    }

    const coverAnim = { active: false, t: 0 };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);

    const onResize = () => {
      layout();
      seedLeaves();
    };
    window.addEventListener("resize", onResize);

    /* ---------- physics + render loop ---------- */

    let time = 0;
    let crackleTimer = 0;

    function step(dt: number) {
      time += dt;
      hst.breath = (hst.breath + dt * (hst.awake ? 0.5 : 0.28)) % 1;
      hst.noseTwitch = Math.max(0, hst.noseTwitch - dt * 0.4);
      hst.petGlow = Math.max(0, hst.petGlow - dt * 0.5);
      if (hst.sneezeT > 0) hst.sneezeT = Math.max(0, hst.sneezeT - dt * 0.9);

      // random fire crackles
      crackleTimer -= dt;
      if (crackleTimer <= 0) {
        crackleTimer = 0.4 + Math.random() * 1.6;
        if (ambienceRef.current === "fire") soundRef.current?.crackle();
      }

      const mx = mouse.x;
      const my = mouse.y;
      const mvx = mouse.x - mouse.px;
      const mvy = mouse.y - mouse.py;
      const speed = Math.hypot(mvx, mvy);
      const radius = hedge.R * (mouse.down ? 2.4 : 1.7);

      if (speed > 1) {
        const now = performance.now();
        if (now - lastRustle > 90 && !stateRef.current.found) {
          lastRustle = now;
          soundRef.current?.rustle(Math.min(1, speed / 40));
        }
      }
      mouse.px = mouse.x;
      mouse.py = mouse.y;

      // cover animation: leaves drift back to their homes softly (the pile
      // over the den is dense, so he gets tucked in naturally)
      if (coverAnim.active) {
        coverAnim.t += dt;
        if (coverAnim.t > 3.5) coverAnim.active = false;
      }

      for (const l of leaves) {
        // cursor push
        const dx = l.x - mx;
        const dy = l.y - my;
        const d = Math.hypot(dx, dy);
        if (d < radius && d > 0.001) {
          const f = (1 - d / radius) * (mouse.down ? 2.2 : 1.2) * l.depth;
          l.vx += (dx / d) * f * 2.4 + mvx * f * 0.12;
          l.vy += (dy / d) * f * 2.4 + mvy * f * 0.12 - f * 0.4;
          l.vrot += ((dx * dy) / (d * d)) * f * 0.06;
        }

        // spring home — much stronger while covering ("укрыть")
        let homeK = stateRef.current.found && l.layer === 2 ? 0.0006 : 0.0022;
        if (coverAnim.active) homeK = 0.012;
        else if (stateRef.current.covered && l.layer === 2) homeK = 0.004;
        l.vx += (l.homeX - l.x) * homeK * dt * 60;
        l.vy += (l.homeY - l.y) * homeK * dt * 60;

        // flutter drift
        l.flutter += dt * 2;
        l.vy += Math.sin(l.flutter) * 0.006 * dt * 60;
        l.vx += Math.cos(l.flutter * 0.7) * 0.004 * dt * 60;

        // damping
        l.vx *= 0.94;
        l.vy *= 0.94;
        l.vrot *= 0.95;

        l.x += l.vx * dt * 60;
        l.y += l.vy * dt * 60;
        l.rot += l.vrot * dt * 60 + (Math.abs(l.vx) + Math.abs(l.vy)) * 0.01;

        // wrap loosely
        if (l.x < -60) l.x = W + 50;
        if (l.x > W + 60) l.x = -50;
        if (l.y < -60) l.y = H + 50;
        if (l.y > H + 60) l.y = -50;
      }

      // particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt * 60;
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.vy += p.kind === "leafbit" ? 0.06 * dt * 60 : 0.02 * dt * 60;
        p.vx *= 0.97;
        p.rot += p.vrot * dt * 60;
        if (p.life > p.maxLife) particles.splice(i, 1);
      }

      // dust motes drifting in the light shafts
      for (const m of motes) {
        m.p += dt * 0.4;
        m.x += Math.cos(m.p) * m.s * dt * 30 + 0.06;
        m.y -= m.s * dt * 22;
        if (m.y < -10) {
          m.y = H + 10;
          m.x = Math.random() * W;
        }
        if (m.x > W + 10) m.x = -10;
      }
    }

    function drawBackground() {
      const g = ctx!.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, BG_TOP);
      g.addColorStop(1, BG_BOTTOM);
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, W, H);

      // vignette warmth
      const rg = ctx!.createRadialGradient(W * 0.7, H * 0.1, 50, W * 0.5, H * 0.4, Math.max(W, H));
      rg.addColorStop(0, "rgba(255,200,120,0.16)");
      rg.addColorStop(0.5, "rgba(255,180,90,0.05)");
      rg.addColorStop(1, "rgba(20,12,4,0.4)");
      ctx!.fillStyle = rg;
      ctx!.fillRect(0, 0, W, H);
    }

    function drawLightShafts() {
      ctx!.save();
      ctx!.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        const x = W * (0.55 + i * 0.16);
        const sway = Math.sin(time * 0.15 + i * 2) * 30;
        const grad = ctx!.createLinearGradient(x + sway, 0, x - W * 0.25 + sway, H);
        grad.addColorStop(0, "rgba(255,214,140,0.10)");
        grad.addColorStop(1, "rgba(255,214,140,0)");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.moveTo(x - 40 + sway, -20);
        ctx!.lineTo(x + 90 + sway, -20);
        ctx!.lineTo(x - W * 0.25 + 140 + sway, H + 20);
        ctx!.lineTo(x - W * 0.25 - 60 + sway, H + 20);
        ctx!.closePath();
        ctx!.fill();
      }
      ctx!.restore();
    }

    function drawLeaf(l: Leaf) {
      ctx!.save();
      ctx!.translate(l.x, l.y);
      ctx!.rotate(l.rot);
      // subtle vertical squash = tumbling in 3D
      const sq = 0.6 + 0.4 * Math.abs(Math.cos(l.flutter * 0.5));
      ctx!.scale(1, sq);
      ctx!.globalAlpha = l.layer === 0 ? 0.75 : 1;
      // watercolour bleed: soft duplicate offset
      ctx!.fillStyle = l.color;
      ctx!.shadowColor = "rgba(20,10,0,0.25)";
      ctx!.shadowBlur = l.layer === 2 ? 8 : 3;
      l.shape(ctx!, l.size, l.size * 1.35);
      ctx!.shadowBlur = 0;
      ctx!.globalAlpha = 0.25;
      ctx!.fillStyle = "#fff";
      ctx!.translate(l.size * 0.06, -l.size * 0.05);
      l.shape(ctx!, l.size * 0.7, l.size * 0.95);
      ctx!.restore();
    }

    function drawParticles() {
      for (const p of particles) {
        const a = 1 - p.life / p.maxLife;
        ctx!.save();
        ctx!.globalAlpha = a;
        ctx!.translate(p.x, p.y);
        if (p.kind === "spark") {
          ctx!.globalCompositeOperation = "lighter";
          const g = ctx!.createRadialGradient(0, 0, 0, 0, 0, p.size * 3);
          g.addColorStop(0, p.color);
          g.addColorStop(1, "rgba(255,200,100,0)");
          ctx!.fillStyle = g;
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size * 3, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.rotate(p.rot);
          ctx!.fillStyle = p.color;
          oval(ctx!, p.size, p.size * 1.3);
        }
        ctx!.restore();
      }
    }

    function drawMotes() {
      ctx!.save();
      ctx!.globalCompositeOperation = "lighter";
      for (const m of motes) {
        const tw = 0.35 + 0.3 * Math.sin(m.p * 3);
        ctx!.fillStyle = `rgba(255,230,180,${tw})`;
        ctx!.beginPath();
        ctx!.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
    }

    function drawZzz() {
      if (stateRef.current.found) return;
      // hint: faint breathing glow under the pile where he sleeps
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.2);
      ctx!.save();
      ctx!.globalCompositeOperation = "lighter";
      const g = ctx!.createRadialGradient(hedge.x, hedge.y, 2, hedge.x, hedge.y, hedge.R * 2.2);
      g.addColorStop(0, `rgba(255,190,110,${0.05 + pulse * 0.05})`);
      g.addColorStop(1, "rgba(255,190,110,0)");
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(hedge.x, hedge.y, hedge.R * 2.2, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    function render() {
      drawBackground();
      drawLightShafts();
      drawZzz();

      const sorted = [...leaves].sort((a, b) => a.layer - b.layer);
      for (const l of sorted) {
        if (l.layer <= 1) drawLeaf(l);
      }

      if (stateRef.current.found && !stateRef.current.covered) {
        drawHedgehog(ctx!, hedge.x, hedge.y, hedge.R, hst);
        // petting aura on the nose
        if (hst.petGlow > 0) {
          ctx!.save();
          ctx!.globalCompositeOperation = "lighter";
          const nx = hedge.x + hedge.R * 0.98;
          const ny = hedge.y + hedge.R * 0.5;
          const g = ctx!.createRadialGradient(nx, ny, 0, nx, ny, hedge.R * 0.7);
          g.addColorStop(0, `rgba(255,220,150,${0.35 * hst.petGlow})`);
          g.addColorStop(1, "rgba(255,220,150,0)");
          ctx!.fillStyle = g;
          ctx!.beginPath();
          ctx!.arc(nx, ny, hedge.R * 0.7, 0, Math.PI * 2);
          ctx!.fill();
          ctx!.restore();
        }
      }

      for (const l of sorted) {
        if (l.layer === 2) {
          const insideDen = Math.hypot(l.x - hedge.x, l.y - hedge.y) < hedge.R * 1.05;
          // while the den is open (and not re-covering), front leaves near him
          // are considered "raked away" — hide them so he stays visible
          const hiddenInDen =
            stateRef.current.found && !coverAnim.active && !stateRef.current.covered && insideDen;
          if (!hiddenInDen) drawLeaf(l);
        }
      }

      // when tucked back in, show a sleepy "zzz" over the pile
      if (stateRef.current.found && coverAnim.active) {
        ctx!.save();
        ctx!.font = `${Math.round(hedge.R * 0.4)}px Georgia`;
        ctx!.fillStyle = `rgba(243,223,184,${0.7 * (1 - coverAnim.t / 3.5)})`;
        const bob = Math.sin(time * 2) * 4;
        ctx!.fillText("z", hedge.x + hedge.R * 0.9, hedge.y - hedge.R * 1.1 + bob);
        ctx!.font = `${Math.round(hedge.R * 0.55)}px Georgia`;
        ctx!.fillText("Z", hedge.x + hedge.R * 1.3, hedge.y - hedge.R * 1.6 - bob);
        ctx!.restore();
      }

      drawParticles();
      drawMotes();

      // rain streaks overlay
      if (ambienceRef.current === "rain") {
        ctx!.save();
        ctx!.strokeStyle = "rgba(200,215,230,0.12)";
        ctx!.lineWidth = 1;
        for (let i = 0; i < 40; i++) {
          const rx = ((i * 97 + time * 500) % (W + 100)) - 50;
          const ry = ((i * 173 + time * 900) % (H + 100)) - 50;
          ctx!.beginPath();
          ctx!.moveTo(rx, ry);
          ctx!.lineTo(rx - 3, ry + 16);
          ctx!.stroke();
        }
        ctx!.restore();
      }
    }

    let prev = performance.now();
    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      step(dt);
      render();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    /* expose cover action to React via ref-like global closure */
    (canvas as unknown as { __cover?: () => void }).__cover = coverHedgehog;

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const handleCover = () => {
    const c = canvasRef.current as unknown as { __cover?: () => void } | null;
    c?.__cover?.();
  };

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setSubscribed(true);
    soundRef.current?.snuffle();
  };

  const statusLine = !found
    ? "Где-то под листвой спит ёжик… Разгребай листья курсором 🍂"
    : !petted
      ? "Он фыркает во сне и морщит носик. Погладь его по носику!"
      : showForm
        ? "Он чихнул три раза и совсем проснулся! Укрой его или оставь подпись ✉️"
        : "Погладь ещё раз — будет смешной «пфф-чих!»";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#3a2c1a] select-none touch-none">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${hoverNose ? "cursor-pointer" : "cursor-grab"} ${started ? "" : "opacity-0"}`}
      />

      {/* ---------------- intro overlay ---------------- */}
      <AnimatePresence>
        {!started && (
          <motion.div
            key="intro"
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#2c3323] via-[#3d3020] to-[#4a3520] text-center"
          >
            <div className="text-6xl animate-[spin_18s_linear_infinite] opacity-70">🍁</div>
            <h1 className="font-serif text-4xl md:text-6xl text-[#f3dfb8] drop-shadow-lg">
              Осенний Ёжик в листве
            </h1>
            <p className="max-w-md px-6 text-[#dcc49a]/90 font-serif italic text-lg">
              Под шум дождя и потрескивание камина кто-то очень пушистый
              сладко спит под горами золотых листьев…
            </p>
            <button
              onClick={start}
              className="mt-4 rounded-full border border-[#e8c88a]/60 bg-[#c98a3d]/20 px-10 py-4 text-xl text-[#f7e6c4] backdrop-blur transition-all hover:scale-105 hover:bg-[#c98a3d]/40 hover:shadow-[0_0_40px_rgba(255,200,120,0.25)]"
            >
              Войти в осенний лес →
            </button>
            <div className="flex gap-3 text-sm text-[#bfa06e]">
              <span>🔊 со звуком</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- HUD ---------------- */}
      {started && (
        <>
          {/* top bar */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 md:p-6">
            <div className="pointer-events-auto max-w-xs rounded-2xl border border-[#e8c88a]/25 bg-[#241a0e]/60 px-5 py-4 backdrop-blur-md">
              <h2 className="font-serif text-lg text-[#f3dfb8]">Осенний Ёжик 🦔</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#dcc49a]/85">{statusLine}</p>
              {sneezes > 0 && (
                <p className="mt-2 text-xs text-[#e8b45c]">
                  Чихов: {sneezes} 💨 · Гладят носа: {petted ? "да" : "нет"}
                </p>
              )}
            </div>

            <div className="pointer-events-auto flex flex-col gap-2">
              <button
                onClick={() => setMuted((m) => !m)}
                className="rounded-full border border-[#e8c88a]/30 bg-[#241a0e]/60 px-4 py-2 text-sm text-[#f3dfb8] backdrop-blur transition hover:bg-[#3a2c1a]"
                title="Звук"
              >
                {muted ? "🔇" : "🔊"}
              </button>
              <button
                onClick={() => setAmbience((a) => (a === "fire" ? "rain" : "fire"))}
                className="rounded-full border border-[#e8c88a]/30 bg-[#241a0e]/60 px-4 py-2 text-sm text-[#f3dfb8] backdrop-blur transition hover:bg-[#3a2c1a]"
                title="Фоновый звук"
              >
                {ambience === "fire" ? "🔥 камин" : "🌧 дождик"}
              </button>
              {found && (
                <button
                  onClick={handleCover}
                  className="rounded-full border border-[#8fbf6a]/40 bg-[#41582c]/70 px-4 py-2 text-sm text-[#eaf3d8] backdrop-blur transition hover:bg-[#4d6a34] hover:shadow-[0_0_25px_rgba(160,220,120,0.2)]"
                >
                  🍃 Укрыть
                </button>
              )}
            </div>
          </div>

          {/* cover toast */}
          <AnimatePresence>
            {coverHint && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#241a0e]/70 px-6 py-3 font-serif text-[#dcc49a] backdrop-blur"
              >
                Тс-с… он снова засыпает 💤
              </motion.div>
            )}
          </AnimatePresence>

          {/* discovery sparkle message */}
          <AnimatePresence>
            {found && !petted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-2xl bg-[#241a0e]/55 px-5 py-2 font-serif italic text-[#f3dfb8] backdrop-blur"
              >
                «Пф-фр… пф-фр…» — носик шевелится во сне
              </motion.div>
            )}
          </AnimatePresence>

          {/* ---------------- newsletter card ---------------- */}
          <AnimatePresence>
            {showForm && !subscribed && (
              <motion.div
                initial={{ opacity: 0, y: 60, rotate: -1 }}
                animate={{ opacity: 1, y: 0, rotate: -1 }}
                exit={{ opacity: 0, y: 60 }}
                transition={{ type: "spring", bounce: 0.4 }}
                className="absolute bottom-6 right-6 z-20 w-[min(92vw,380px)] rounded-[2rem] border border-[#e8c88a]/30 bg-[#2a1f11]/85 p-7 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <div className="mb-3 text-3xl">💌</div>
                <h3 className="font-serif text-2xl leading-snug text-[#f3dfb8]">
                  Найди свой уют
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#dcc49a]/85">
                  Тёплые письма по пятницам: истории, тишина и запах мокрых
                  листьев. Без спама — только уют.
                </p>
                <form onSubmit={subscribe} className="mt-5 flex flex-col gap-3">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="тёплое@письмо.ру"
                    className="rounded-xl border border-[#e8c88a]/25 bg-[#1c1409]/80 px-4 py-3 text-[#f3dfb8] placeholder-[#8a7350] outline-none transition focus:border-[#e8b45c]/70 focus:shadow-[0_0_20px_rgba(255,200,120,0.15)]"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-[#c98a3d] to-[#b8642f] px-4 py-3 font-semibold text-[#fff4dd] transition hover:brightness-110 active:scale-[0.98]"
                  >
                    Укрыться письмами 🍂
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-xs text-[#8a7350] underline-offset-2 hover:underline"
                  >
                    не сейчас, ёжик ещё поспит
                  </button>
                </form>
              </motion.div>
            )}

            {subscribed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute bottom-6 right-6 z-20 w-[min(92vw,380px)] rounded-[2rem] border border-[#8fbf6a]/40 bg-[#26331c]/85 p-7 text-center backdrop-blur-xl"
              >
                <div className="text-4xl">🦔💤</div>
                <h3 className="mt-3 font-serif text-xl text-[#eaf3d8]">
                  Ёж довольно сопнит.
                </h3>
                <p className="mt-2 text-sm text-[#bcc9a4]/90">
                  Первое тёплое письмо прилетит в пятницу. А пока — погладь его
                  ещё разок или нажми «Укрыть».
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </main>
  );
}
