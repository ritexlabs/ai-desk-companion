import { useCallback, useState } from 'react';

export interface AppConfig {
  wakeWord: string;
  callingName: string;
}

const DEFAULT: AppConfig = {
  wakeWord: 'Robo',
  callingName: 'Master',
};

const KEY = 'robo-app-config';

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
    } catch {
      return DEFAULT;
    }
  });

  const update = useCallback((partial: Partial<AppConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { config, update };
}
