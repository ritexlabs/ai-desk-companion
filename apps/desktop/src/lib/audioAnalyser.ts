/**
 * Singleton Web Audio analyser — shared between TTS playback and mic input.
 *
 * TTS path:  HTMLAudioElement → MediaElementSource → ttsAnalyser → destination
 *            (audio still plays; we also read FFT data)
 * Mic path:  MediaStream      → MediaStreamSource  → micAnalyser
 *            (NOT routed to destination — avoids speaker feedback)
 *
 * Callers read from `getActiveFrequency()` which picks the live source.
 */

const FFT_SIZE = 256;
const SMOOTH   = 0.8;

let audioCtx: AudioContext | null = null;

// TTS analyser — connected to destination so audio plays through speakers
let ttsAnalyser:    AnalyserNode | null = null;
let ttsSource:      MediaElementAudioSourceNode | null = null;

// Mic analyser — NOT connected to destination
let micAnalyser:    AnalyserNode | null = null;
let micSource:      MediaStreamAudioSourceNode | null = null;
let micStream:      MediaStream | null = null;

type ActiveMode = 'tts' | 'mic' | 'none';
let activeMode: ActiveMode = 'none';

// Once an HTMLAudioElement has been wrapped, the Web Audio API won't let us wrap
// it again with a different context.  Track which elements we've already seen.
const wrappedElements = new WeakSet<HTMLAudioElement>();

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctor();

    ttsAnalyser = audioCtx.createAnalyser();
    ttsAnalyser.fftSize              = FFT_SIZE;
    ttsAnalyser.smoothingTimeConstant = SMOOTH;
    ttsAnalyser.connect(audioCtx.destination);

    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize              = FFT_SIZE;
    micAnalyser.smoothingTimeConstant = SMOOTH;
    // Mic analyser intentionally NOT connected to destination
  }
  return audioCtx;
}

function resumeCtx() {
  if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
}

/** Connect an HTMLAudioElement (server TTS) to the TTS analyser. */
export function connectElement(el: HTMLAudioElement): void {
  // Disconnect previous TTS source
  try { ttsSource?.disconnect(); } catch { /* no-op */ }
  ttsSource = null;

  const ctx = getCtx();
  resumeCtx();

  if (!wrappedElements.has(el)) {
    // First time we see this element — safe to wrap
    try {
      const src = ctx.createMediaElementSource(el);
      wrappedElements.add(el);
      src.connect(ttsAnalyser!);
      ttsSource = src;
    } catch {
      // Browser rejected the wrap; fall back to animation
    }
  } else {
    // Element was already wrapped by the same AudioContext — reuse works
    // (no-op: the existing graph is still connected)
  }

  activeMode = 'tts';
}

/** Open a mic stream for real-time input visualisation (does NOT affect STT). */
export async function connectMic(): Promise<() => void> {
  // Stop any previous mic stream
  disconnectMic();

  const ctx = getCtx();
  resumeCtx();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micStream = stream;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(micAnalyser!);
    micSource = src;
    activeMode = 'mic';
  } catch {
    // Permission denied or unavailable — fall back to animation
  }

  return disconnectMic;
}

function disconnectMic() {
  try { micSource?.disconnect(); } catch { /* no-op */ }
  micSource = null;
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  if (activeMode === 'mic') activeMode = 'none';
}

/** Call after TTS playback ends so subsequent silence reads as zero. */
export function disconnectTts(): void {
  try { ttsSource?.disconnect(); } catch { /* no-op */ }
  ttsSource = null;
  if (activeMode === 'tts') activeMode = 'none';
}

/** Read frequency-domain data from whichever source is currently active. */
export function getActiveFrequency(): Uint8Array {
  const analyser = activeMode === 'mic' ? micAnalyser : ttsAnalyser;
  if (!analyser) return new Uint8Array(0);
  const buf = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(buf);
  return buf;
}

/** True when a live audio source is connected. */
export function hasLiveSource(): boolean {
  return activeMode !== 'none';
}
