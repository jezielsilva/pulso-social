import { createContext, useContext } from 'react';
import type { Account, BestTimes, Post, PostType } from './api';

export type Tab = 'home' | 'cal' | 'stats' | 'inbox';

export interface ComposerSeed { post?: Post; type?: PostType; at?: Date }

export interface AppCtx {
  go: (t: Tab) => void;
  compose: (seed?: ComposerSeed) => void;
  openSettings: () => void;
  toast: (msg: string, err?: boolean) => void;
  accounts: Account[];
  best: BestTimes | null;
  /** muda quando um post é criado/alterado, para as telas recarregarem */
  version: number;
  bump: () => void;
  toggleTheme: () => void;
}

export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);
