import { useCallback, useRef } from 'react';

/**
 * Plays audio received as a base64 string from the orchestrator TTS provider.
 * Falls back silently on any error so the caller's Promise always resolves.
 */
export function useAudioPlayer() {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.src = '';
      currentAudioRef.current = null;
    }
  }, []);

  const play = useCallback((audio_b64: string, format: string = 'mp3'): Promise<void> => {
    return new Promise((resolve) => {
      stop();

      const audio = new Audio(`data:audio/${format};base64,${audio_b64}`);
      currentAudioRef.current = audio;

      const cleanup = () => {
        currentAudioRef.current = null;
        resolve();
      };

      audio.onended  = cleanup;
      audio.onerror  = cleanup;
      audio.onabort  = cleanup;

      audio.play().catch(cleanup);
    });
  }, [stop]);

  return { play, stop };
}
