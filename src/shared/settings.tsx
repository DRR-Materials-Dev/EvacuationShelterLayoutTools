import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { UserSettings } from './types.ts';
import { getStoredUserSettings, setStoredUserSettings } from './storage.ts';

type SettingsContextValue = {
  settings: UserSettings;
  updateSettings: (next: UserSettings) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<UserSettings>(() => getStoredUserSettings());

  const updateSettings = useCallback((next: UserSettings) => {
    setSettings(next);
    setStoredUserSettings(next);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useUserSettings = (): SettingsContextValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useUserSettings must be used within <SettingsProvider>');
  }
  return ctx;
};
