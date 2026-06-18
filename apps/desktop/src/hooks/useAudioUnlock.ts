import { useEffect, useState } from 'react';

/**
 * Unlocks browser audio on the first user interaction (click / keydown / touch).
 * Chrome and Safari block audio.play() and SpeechSynthesis until a user gesture
 * has been received. One silent AudioContext buffer + one silent utterance is
 * enough to satisfy both APIs for the lifetime of the page.
 */
export function useAudioUnlock() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    let done = false;

    const unlock = () => {
      if (done) return;
      done = true;

      // Unlock Web Audio API
      try {
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const buf = ctx.createBuffer(1, 1, 22050);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(0);
          ctx.resume().catch(() => {});
        }
      } catch {}

      // Unlock HTML5 Audio
      try {
        const a = new Audio();
        a.play().catch(() => {});
        a.pause();
      } catch {}

      // Unlock SpeechSynthesis
      try {
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance('');
          u.volume = 0;
          window.speechSynthesis.speak(u);
          window.speechSynthesis.cancel();
        }
      } catch {}

      setAudioUnlocked(true);
    };

    window.addEventListener('click',    unlock, { once: true, capture: true });
    window.addEventListener('keydown',  unlock, { once: true, capture: true });
    window.addEventListener('touchend', unlock, { once: true, capture: true });

    return () => {
      window.removeEventListener('click',    unlock, { capture: true });
      window.removeEventListener('keydown',  unlock, { capture: true });
      window.removeEventListener('touchend', unlock, { capture: true });
    };
  }, []);

  return audioUnlocked;
}
