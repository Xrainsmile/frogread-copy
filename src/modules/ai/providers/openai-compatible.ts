// OpenAI-compatible providers (DeepSeek, GLM, OpenAI, SiliconFlow, custom).
// They all speak the OpenAI /chat/completions protocol, so a single factory
// builds each one with a distinct default endpoint.

import type { Provider, ConnectionTest } from '../provider';
import type { Settings } from '../../types';
import type { PageContext } from '../../translation/context';
import { buildSystemPrompt, buildExplainPrompt } from '../prompt';
import { numberedList, parseNumbered } from '../parse';
import { logger } from '../../utils/logger';

interface ChatMsg {
  role: string;
  content: string;
}

function makeOpenAIProvider(
  id: string,
  name: string,
  defaultEndpoint: string,
  defaultModel?: string,
): Provider {
  return {
    id,
    name,
    defaultEndpoint,
    defaultModel,
    models: [],
    freeModel: true,
    async translate(
      texts: string[],
      settings: Settings,
      context: PageContext | null,
      task: 'translate' | 'explain' = 'translate',
      systemPrompt?: string,
    ): Promise<string[]> {
      const instruction =
        systemPrompt ??
        (task === 'explain'
          ? buildExplainPrompt(settings.targetLang, settings.enableAIContentAware ? context : null, {
              level: settings.level,
            })
          : buildSystemPrompt(settings.targetLang, settings.enableAIContentAware ? context : null, {
              customPrompt: settings.customPrompt,
              sourceLang: settings.sourceLang,
            }));
      const messages: ChatMsg[] = [
        { role: 'system', content: instruction },
        { role: 'user', content: numberedList(texts) },
      ];
      const base = (settings.endpoint || defaultEndpoint).replace(/\/$/, '');
      const url = `${base}/chat/completions`;
      const body = JSON.stringify({
        model: settings.model || defaultModel || 'gpt-4o-mini',
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
        const data = await resp.json();
        if (data.error) throw new Error(data.error.message || 'API error');
        const content: string | undefined = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('模型返回为空');
        const lines = parseNumbered(content, texts.length);
        return texts.map((t, i) => (lines[i] && lines[i].trim() ? lines[i] : t));
      } finally {
        clearTimeout(timer);
      }
    },
    async testConnection(settings: Settings): Promise<ConnectionTest> {
      try {
        if (!settings.apiKey) return { ok: false, message: '请填写 API Key' };
        const base = (settings.endpoint || defaultEndpoint).replace(/\/$/, '');
        if (!base) return { ok: false, message: '请填写自定义接口地址' };
        const resp = await fetch(`${base}/models`, {
          headers: { Authorization: `Bearer ${settings.apiKey}` },
        });
        if (!resp.ok) return { ok: false, message: `连接失败 HTTP ${resp.status}` };
        return { ok: true, message: '连接成功' };
      } catch (e) {
        logger.error(`${name} testConnection failed`, e);
        return { ok: false, message: String(e) };
      }
    },
  };
}

export const fatProvider = makeOpenAIProvider(
  'fat',
  'FAT (公司 AI 网关)',
  'http://dev.fit-ai.woa.com/api/llmproxy',
  'deepseek-v3.1',
);

export const deepseekProvider = makeOpenAIProvider(
  'deepseek',
  'DeepSeek',
  'https://api.deepseek.com',
  'deepseek-chat',
);
export const glmProvider = makeOpenAIProvider('glm', '智谱 GLM', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4-plus');
export const openaiProvider = makeOpenAIProvider('openai', 'OpenAI', 'https://api.openai.com/v1', 'gpt-4o-mini');
export const siliconflowProvider = makeOpenAIProvider(
  'siliconflow',
  'SiliconFlow',
  'https://api.siliconflow.cn/v1',
  'deepseek-ai/DeepSeek-V3',
);
export const customProvider = makeOpenAIProvider('custom', '自定义 OpenAI 兼容', '', '');
