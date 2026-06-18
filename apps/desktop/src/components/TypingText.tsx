import { useEffect, useRef, useState } from 'react';

interface TypingTextProps {
  text: string;
  speed?: number;        // ms per character
  className?: string;
  onDone?: () => void;
}

export function TypingText({ text, speed = 22, className, onDone }: TypingTextProps) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;

    timerRef.current = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timerRef.current!);
        setDone(true);
        onDone?.();
      }
    }, speed);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [text, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className={className}>
      {displayed}
      {!done && (
        <span className="ml-px inline-block w-px h-[1.1em] align-middle bg-current opacity-80 animate-pulse" />
      )}
    </span>
  );
}
