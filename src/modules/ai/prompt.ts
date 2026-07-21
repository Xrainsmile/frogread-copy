// Builds the system prompt for translation, incorporating page context for
// context-aware translation (read-frog style).

import type { PageContext } from '../translation/context';

import type { GeneralLevel } from '../types';

export interface PromptOpts {
  /** Override the entire system prompt when non-empty. */
  customPrompt?: string;
  /** Learning level — adjusts phrasing depth for explain tasks. */
  level?: GeneralLevel;
  /** Source language hint ('auto' = detect). */
  sourceLang?: string;
}

export function buildSystemPrompt(
  targetLang: string,
  context: PageContext | null,
  opts?: PromptOpts,
): string {
  if (opts?.customPrompt && opts.customPrompt.trim()) {
    let content = opts.customPrompt;
    content = content.replace(/\{\{\s*targetLang\s*\}\}/g, targetLang);
    if (context?.title) content += `\n\n网页标题：${context.title}`;
    if (context?.url) content += `\n网页 URL：${context.url}`;
    if (context?.description) content += `\n网页简介：${context.description}`;
    if (context?.headings?.length) content += `\n页面主要标题/关键词：${context.headings.join('、')}`;
    if (context?.glossary) content += `\n\n术语表（请优先使用这些译法）：\n${context.glossary}`;
    content += `\n\n请按以下格式返回，每行对应一条输入：\n1. 翻译结果\n2. 翻译结果\n...`;
    return content;
  }

  const lc = (targetLang || '').toLowerCase();
  const isZh = lc === 'zh-hans' || lc === 'zh-hant' || lc === 'zh' || /chinese/i.test(targetLang);
  const srcHint =
    opts?.sourceLang && opts.sourceLang !== 'auto' ? `源语言：${opts.sourceLang}。` : '';

  let content: string;
  if (isZh) {
    content = `你是一个专业的翻译助手。请将用户提供的网页内容翻译为简体中文。
要求：
1. 保持原意准确，不要增删信息
2. 保留原文的格式和编号
3. 专有名词（人名、地名、公司名、产品名）可保留英文或音译
4. 如果原文已经是中文，请原样返回
5. 直接输出翻译结果，不要添加任何解释或前缀
6. 逐条对应输入的行号，每行一条翻译结果${srcHint ? '\n7. ' + srcHint : ''}`;
  } else {
    content = `You are a professional translator. Please translate the provided web content into ${targetLang}.
Requirements:
1. Preserve the original meaning accurately, do not add or remove information
2. Preserve the original formatting and numbering
3. Proper nouns (names, places, companies, products) may keep English or be transliterated
4. If the source is already in ${targetLang}, return it unchanged
5. Output only the translation, no explanations or prefixes
6. Correspond to the input line numbers, one translation per line${srcHint ? '\n7. ' + srcHint : ''}`;
  }

  if (context?.title) content += `\n\n网页标题：${context.title}`;
  if (context?.url) content += `\n网页 URL：${context.url}`;
  if (context?.description) content += `\n网页简介：${context.description}`;
  if (context?.headings?.length) content += `\n页面主要标题/关键词：${context.headings.join('、')}`;
  if (context?.glossary) content += `\n\n术语表（请优先使用这些译法）：\n${context.glossary}`;

  content += `\n\n请按以下格式返回，每行对应一条输入：\n1. 翻译结果\n2. 翻译结果\n...`;
  return content;
}

/** Prompt used by the selection toolbar's "explain" action. */
export function buildExplainPrompt(
  targetLang: string,
  context: PageContext | null,
  opts?: PromptOpts,
): string {
  const lc = (targetLang || '').toLowerCase();
  const isZh = lc === 'zh-hans' || lc === 'zh-hant' || lc === 'zh' || /chinese/i.test(targetLang);
  const level = opts?.level ?? 'intermediate';
  const levelHint =
    level === 'beginner'
      ? '请使用通俗易懂的语言，避免生僻术语。'
      : level === 'advanced'
        ? '可以使用专业术语，并给出更深入的背景。'
        : '使用适中的语言深度。';
  let content: string;
  if (isZh) {
    content = `你是一个 helpful 的解释助手。请用简体中文解释用户选中的内容：
1. 概括其含义
2. 如有专业术语，请解释
3. 如有必要，给出背景或例子
${levelHint}
直接输出解释，不要添加前缀。`;
  } else {
    content = `You are a helpful explainer. Explain the selected content in ${targetLang}:
1. Summarize its meaning
2. Explain any technical terms
3. Give background or examples if helpful
${levelHint}
Output the explanation directly, no prefixes.`;
  }
  if (context?.title) content += `\n\n上下文（网页标题）：${context.title}`;
  return content;
}
