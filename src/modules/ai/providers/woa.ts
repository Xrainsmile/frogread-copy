// Shared logic for the Tencent internal WOA providers (Hunyuan / Taiji).
//
// Most models speak the OpenAI-compatible /chat/completions protocol and are
// authenticated with a simple `Bearer <token>` (the API key IS the token).
// `hunyuan-translation-pro` instead uses the dedicated /openapi/v1/translations
// interface (single text segment, no system prompt) — see woaTranslateViaApi.
// This mirrors the original ReadFlow v1 implementation — the earlier TC3-HMAC
// signing was incorrect for these endpoints and caused "apitoken 识别失败".

import type { Provider, ConnectionTest } from '../provider';
import type { Settings } from '../../types';
import type { PageContext } from '../../translation/context';
import { buildSystemPrompt, buildExplainPrompt } from '../prompt';
import { numberedList, parseNumbered } from '../parse';
import { logger } from '../../utils/logger';

const V2_MODELS = ['hunyuan-translation-pro-chat'];

// Models that expose the dedicated /openapi/v1/translations interface (single
// text segment, no system prompt). Only these route to woaTranslateViaApi.
const TRANSLATE_API_MODELS = ['hunyuan-translation-pro'];

function isV2Model(model: string): boolean {
  return V2_MODELS.includes(model);
}

function isTranslationApiModel(model: string): boolean {
  return TRANSLATE_API_MODELS.includes(model);
}

// Translation-tuned models (hunyuan-translation-*) cannot follow arbitrary
// instruction prompts (explain / summarize / custom actions). They only
// translate. The 'hunyuan-translation-pro-chat' variant is excluded — it is a
// chat-capable v2 model. When an instruction-following task targets a
// translation-only model, we fall back to a general chat model below.
function isTranslationOnlyModel(model: string): boolean {
  return /^hunyuan-translation-(?!pro-chat)/i.test(model);
}

// General chat model used when an instruction-following task (explain / custom
// prompt) would otherwise hit a translation-only model.
const CHAT_FALLBACK_MODEL = 'hunyuan-turbos-latest';

/** Resolve the chat-completions URL for a WOA provider + model. */
function chatUrl(providerId: string, model: string): string {
  if (isV2Model(model)) {
    return 'http://api.taiji.woa.com/openapi/v2/chat/completions';
  }
  const host = providerId === 'taiji' ? 'api.taiji.woa.com' : 'hunyuanapi.woa.com';
  return `http://${host}/openapi/v1/chat/completions`;
}

function resolveModel(settings: Settings): string {
  return settings.model && settings.model !== 'translate'
    ? settings.model
    : 'hunyuan-translation-pro';
}

interface ChatMsg {
  role: string;
  content: string;
}

async function woaTranslate(
  providerId: string,
  texts: string[],
  settings: Settings,
  context: PageContext | null,
  task: 'translate' | 'explain' = 'translate',
  systemPrompt?: string,
): Promise<string[]> {
  if (!settings.apiKey) throw new Error('请先填写 API Token');

  const instruction =
    systemPrompt ??
    (task === 'explain'
      ? buildExplainPrompt(settings.targetLang, context)
      : buildSystemPrompt(settings.targetLang, context));
  const messages: ChatMsg[] = [
    { role: 'system', content: instruction },
    { role: 'user', content: numberedList(texts) },
  ];

  const model = resolveModel(settings);

  // Instruction-following tasks (explain / custom-action prompts) need a
  // general chat model. Translation-only models (hunyuan-translation-*) can't
  // follow such prompts — they'd just translate (or echo) the input. Switch to
  // a chat-capable model so the explain/summarize prompt is actually honored.
  const needsChatModel = task !== 'translate' || !!systemPrompt;
  const effectiveModel =
    needsChatModel && isTranslationOnlyModel(model) ? CHAT_FALLBACK_MODEL : model;

  // Route translation-only requests (no custom prompt) through the dedicated
  // /translations interface. Anything with a systemPrompt must stay on chat so
  // the prompt isn't silently dropped.
  if (task === 'translate' && !systemPrompt && isTranslationApiModel(effectiveModel)) {
    return woaTranslateViaApi(providerId, texts, settings, context);
  }

  const url = chatUrl(providerId, effectiveModel);
  const body = JSON.stringify({
    model: effectiveModel,
    messages,
    temperature: 0.3,
    stream: false,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body,
      signal: controller.signal,
    });

    const raw = await resp.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      // Surface gateway / HTML error pages verbatim for easier debugging.
      throw new Error(`接口返回非 JSON（HTTP ${resp.status}）：${raw.slice(0, 300)}`);
    }
    if (data.error) {
      const msg = typeof data.error === 'string' ? data.error : data.error.message || 'API error';
      throw new Error(msg);
    }
    const content: string | undefined = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('模型返回为空');

    const lines = parseNumbered(content, texts.length);
    return texts.map((t, i) => (lines[i]?.trim() ? lines[i] : t));
  } finally {
    clearTimeout(timer);
  }
}

/** Map a BCP-47-ish ReadFlow language code to the /translations interface code. */
function mapTranslateLang(code: string): string {
  const lc = (code || '').toLowerCase();
  if (lc.startsWith('zh')) {
    return lc.includes('hant') || lc.includes('tw') || lc.includes('hk') || lc.includes('tr')
      ? 'zh-TR'
      : 'zh';
  }
  return lc || 'en';
}

/** Parse a free-text glossary (one "term : translation" per line) into the
 *  structured `references` (term type) accepted by /translations. Max 10. */
interface TranslateReference {
  type: 'term';
  text: string;
  translation: string;
}

function parseGlossaryReferences(glossary?: string): TranslateReference[] {
  if (!glossary || !glossary.trim()) return [];
  const refs: TranslateReference[] = [];
  for (const raw of glossary.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)[\s]*[:：=→>|][\s]*(.+)$/);
    if (m && m[1].trim() && m[2].trim()) {
      refs.push({ type: 'term', text: m[1].trim(), translation: m[2].trim() });
    }
    if (refs.length >= 10) break;
  }
  return refs;
}

/** Build the `context` string fed to the dedicated translation interface. */
function buildTranslateContext(settings: Settings, context: PageContext | null): string {
  const parts: string[] = [];
  if (settings.enableAIContentAware && context) {
    if (context.title) parts.push(`页面标题：${context.title}`);
    if (context.url) parts.push(`页面链接：${context.url}`);
    if (context.description) parts.push(`页面简介：${context.description}`);
    if (context.headings?.length) parts.push(`页面要点：${context.headings.join('；')}`);
  }
  return parts.join('\n');
}

/** Dedicated /openapi/v1/translations endpoint (used by hunyuan-translation-pro). */
async function woaTranslateViaApi(
  providerId: string,
  texts: string[],
  settings: Settings,
  context: PageContext | null,
): Promise<string[]> {
  if (!settings.apiKey) throw new Error('请先填写 API Token');

  const model = resolveModel(settings);
  const host = providerId === 'taiji' ? 'api.taiji.woa.com' : 'hunyuanapi.woa.com';
  const url = `http://${host}/openapi/v1/translations`;

  const target = mapTranslateLang(settings.targetLang);
  const source =
    settings.sourceLang && settings.sourceLang !== 'auto'
      ? mapTranslateLang(settings.sourceLang)
      : undefined;
  const ctx = buildTranslateContext(settings, context);
  const refs = parseGlossaryReferences(context?.glossary);
  // 术语表可解析为 term 时走结构化 references；否则兜底注入 context。
  const ctxWithGlossary =
    refs.length === 0 && context?.glossary
      ? `${ctx}\n术语表（请优先使用这些译法）：${context.glossary}`.trim()
      : ctx;

  const payload: Record<string, unknown> = {
    model,
    text: numberedList(texts),
    target,
    stream: false,
  };
  if (source) payload.source = source;
  if (ctxWithGlossary) payload.context = ctxWithGlossary;
  if (refs.length) payload.references = refs;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await resp.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`接口返回非 JSON（HTTP ${resp.status}）：${raw.slice(0, 300)}`);
    }
    if (data.error) {
      const msg = typeof data.error === 'string' ? data.error : data.error.message || 'API error';
      throw new Error(msg);
    }
    const content: string | undefined = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('模型返回为空');

    const lines = parseNumbered(content, texts.length);
    return texts.map((t, i) => (lines[i]?.trim() ? lines[i] : t));
  } finally {
    clearTimeout(timer);
  }
}

async function woaTestConnection(settings: Settings): Promise<ConnectionTest> {
  if (!settings.apiKey) return { ok: false, message: '请填写 API Token' };
  const model = resolveModel(settings);
  try {
    // 针对当前所选接口做专门连通性校验：
    // - 翻译专用模型 → /translations 接口
    // - 其余模型 → /chat/completions
    const result = isTranslationApiModel(model)
      ? await woaTranslateViaApi('taiji', ['hello'], settings, null)
      : await woaTranslate('taiji', ['hello'], settings, null, 'translate');
    if (result[0]?.trim()) {
      const via = isTranslationApiModel(model) ? '（translations 接口）' : '（chat 接口）';
      return { ok: true, message: `连接成功${via}` };
    }
    return { ok: false, message: '返回为空，请检查 Token' };
  } catch (e) {
    logger.error('WOA testConnection failed', e);
    return { ok: false, message: String(e) };
  }
}

const WOA_MODELS = [
  { name: '混元翻译Pro(对话)', value: 'hunyuan-translation-pro-chat' },
  { name: '混元翻译Lite', value: 'hunyuan-translation-lite' },
  { name: '混元翻译标准', value: 'hunyuan-translation-standard' },
  { name: '混元翻译Pro', value: 'hunyuan-translation-pro' },
  { name: '混元标准', value: 'hunyuan-standard' },
  { name: '混元Turbo', value: 'hunyuan-turbo' },
];

export function makeWoaProvider(id: string, name: string): Provider {
  return {
    id,
    name,
    defaultEndpoint: 'http://api.taiji.woa.com/openapi/v2',
    defaultModel: 'hunyuan-translation-pro',
    models: WOA_MODELS,
    freeModel: false,
    translate: (texts, settings, context, task, systemPrompt) =>
      woaTranslate(id, texts, settings, context, task, systemPrompt),
    testConnection: (settings) => woaTestConnection(settings),
  };
}
