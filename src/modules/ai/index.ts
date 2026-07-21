// Provider registry + helpers for the popup and background.

import type { Provider } from './provider';
import type { ProviderId } from '../types';
import { hunyuanProvider } from './providers/hunyuan';
import { taijiProvider } from './providers/taiji';
import {
  fatProvider,
  deepseekProvider,
  glmProvider,
  openaiProvider,
  siliconflowProvider,
  customProvider,
} from './providers/openai-compatible';

export const PROVIDERS: Record<string, Provider> = {
  hunyuan: hunyuanProvider,
  taiji: taijiProvider,
  fat: fatProvider,
  deepseek: deepseekProvider,
  glm: glmProvider,
  openai: openaiProvider,
  siliconflow: siliconflowProvider,
  custom: customProvider,
};

export function getProvider(id: string | ProviderId): Provider {
  return PROVIDERS[id] ?? hunyuanProvider;
}

export interface ProviderMeta {
  id: string;
  name: string;
  defaultEndpoint: string;
  defaultModel?: string;
  models: { name: string; value: string }[];
  freeModel: boolean;
}

/** Metadata used by the popup to render provider-specific fields. */
export const PROVIDER_LIST: ProviderMeta[] = Object.values(PROVIDERS).map((p) => ({
  id: p.id,
  name: p.name,
  defaultEndpoint: p.defaultEndpoint,
  defaultModel: p.defaultModel,
  models: p.models,
  freeModel: p.freeModel,
}));
