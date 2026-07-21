import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AppConfig } from '../../modules/config/types';
import { DEFAULT_CONFIG } from '../../modules/config/default';
import { getConfig, saveConfig } from '../../modules/config/storage';

type Updater = (draft: AppConfig) => void;

interface ConfigContextValue {
  config: AppConfig;
  loaded: boolean;
  /** Apply a mutation and persist (debounced). */
  update: (fn: Updater) => void;
  /** Replace whole config and persist immediately. */
  replace: (config: AppConfig) => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

function clone<T>(v: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getConfig().then((c) => {
      setConfig(c);
      setLoaded(true);
    });
  }, []);

  // 立即持久化：选项改动很小且不频繁，防抖在用户快速关闭选项页时会丢改动。
  const persist = (next: AppConfig) => {
    saveConfig(next).catch(() => {});
  };

  const update = (fn: Updater) => {
    setConfig((prev) => {
      const draft = clone(prev);
      fn(draft);
      persist(draft);
      return draft;
    });
  };

  const replace = (next: AppConfig) => {
    setConfig(next);
    saveConfig(next).catch(() => {});
  };

  return (
    <ConfigContext.Provider value={{ config, loaded, update, replace }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider');
  return ctx;
}
