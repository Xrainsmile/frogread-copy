// Provider interface — every translation backend (Hunyuan, Taiji, OpenAI-compatible)
// implements this so the router can treat them uniformly.

import type { Settings, AIModelOption } from '../types';
import type { PageContext } from '../translation/context';

export interface LookupResult {
  phonetic?: string;
  definition: string;
}

export interface ConnectionTest {
  ok: boolean;
  message: string;
}

export interface Provider {
  id: string;
  name: string;
  /** Default API base URL. */
  defaultEndpoint: string;
  /** Model id suggested when the user switches to this provider. */
  defaultModel?: string;
  /** Model options for the dropdown; empty => free-text input. */
  models: AIModelOption[];
  /** Whether the model is entered as free text rather than chosen from a list. */
  freeModel: boolean;
  /** Translate a batch of texts (returns an array the same length as `texts`). */
  translate(
    texts: string[],
    settings: Settings,
    context: PageContext | null,
    task?: 'translate' | 'explain',
    /** Override the system prompt entirely (used by custom AI actions). */
    systemPrompt?: string,
  ): Promise<string[]>;
  /** Optional dictionary lookup (used by the hover dictionary). */
  lookup?(word: string, settings: Settings): Promise<LookupResult>;
  /** Test connectivity / credentials with the current settings. */
  testConnection(settings: Settings): Promise<ConnectionTest>;
}
