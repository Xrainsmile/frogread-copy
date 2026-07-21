// DOM injection — creates the dual-display (original + translation) wrappers
// and applies the display mode. Ported from the legacy content/injector.ts.

import { sanitizeText } from './detector';

export const CSS_PREFIX = 'rf-';
const MAX_TRANSLATION_LENGTH = 4000;

export function createTranslationElement(text: string): HTMLElement {
  const div = document.createElement('div');
  div.className = CSS_PREFIX + 'translation';
  div.textContent = text;
  if (text.length > MAX_TRANSLATION_LENGTH) {
    div.style.maxHeight = '400px';
    div.style.overflowY = 'auto';
  }
  return div;
}

export function getOrCreateWrapper(target: HTMLElement): HTMLElement {
  let wrapper = target.querySelector('.' + CSS_PREFIX + 'wrapper') as HTMLElement | null;
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = CSS_PREFIX + 'wrapper';
    wrapper.style.marginTop = '4px';
    target.appendChild(wrapper);
  }
  return wrapper;
}

/** Backward-compatible alias used by manager.ts watchdog & cleanup. */
export function getExistingWrapper(target: HTMLElement): HTMLElement | null {
  return target.querySelector('.' + CSS_PREFIX + 'wrapper') as HTMLElement | null;
}

/** Show a small inline spinner inside the paragraph's wrapper while the
 *  translation API is in flight. Idempotent: a second call won't stack
 *  multiple spinners. The spinner is removed automatically when
 *  injectTranslations() rebuilds the wrapper, or via hideLoading(). */
export function showLoading(target: HTMLElement): void {
  const wrapper = getOrCreateWrapper(target);
  if (wrapper.querySelector('.' + CSS_PREFIX + 'loader')) return;
  const loader = document.createElement('span');
  loader.className = CSS_PREFIX + 'loader';
  loader.setAttribute('aria-label', '翻译中');
  wrapper.appendChild(loader);
}

/** Remove the in-flight spinner for a single paragraph (e.g. on error). */
export function hideLoading(target: HTMLElement): void {
  const wrapper = getExistingWrapper(target);
  if (!wrapper) return;
  wrapper.querySelector('.' + CSS_PREFIX + 'loader')?.remove();
}

export function applyModeClasses(
  wrapper: HTMLElement,
  mode: string,
  showOriginalOnHover: boolean,
): void {
  wrapper.classList.toggle('rf-only-translation', mode === 'translated-only');
  wrapper.classList.toggle('rf-original-hidden', mode === 'translated-only');
  wrapper.classList.toggle('rf-hide-translation', mode === 'original');
  wrapper.classList.toggle('rf-hover-enabled', showOriginalOnHover);
}

/**
 * Inject translated strings into their target elements.
 * @param strMap  map of stored-hash-key -> translated text
 * @param mode    display mode
 */
export function injectTranslations(
  strMap: Map<string, string>,
  mode: string,
  showOriginalOnHover: boolean,
  storedHashMap: Map<string, Element>,
  translatedSet: Set<Element>,
): void {
  for (const [hashKey, str] of strMap) {
    const el = storedHashMap.get(hashKey);
    if (!el) continue;
    const wrapper = getOrCreateWrapper(el as HTMLElement);
    wrapper.innerHTML = '';
    // Treat "translation equals original" as a likely failure (router falls
    // back to the source text on error) → show the error marker.
    const originalText = sanitizeText(el);
    const isError = str.length > 0 && str === originalText;
    wrapper.appendChild(createTranslationElement(str));
    if (isError) {
      const err = document.createElement('span');
      err.className = CSS_PREFIX + 'error-mark';
      err.textContent = '!';
      err.title = '翻译失败，点击重试';
      wrapper.appendChild(err);
    }
    const retry = document.createElement('span');
    retry.className = CSS_PREFIX + 'retry-btn';
    retry.innerHTML = '&#x21bb;';
    retry.title = '重试翻译';
    retry.setAttribute('data-rf-action', 'retry');
    wrapper.appendChild(retry);
    wrapper.classList.add('rf-translated');
    applyModeClasses(wrapper, mode, showOriginalOnHover);
    translatedSet.add(el);
  }
}

export function setMode(
  mode: string,
  showOriginalOnHover: boolean,
  translatedSet: Set<Element>,
): void {
  document.documentElement.setAttribute(CSS_PREFIX + 'mode', mode);
  document.documentElement.setAttribute(CSS_PREFIX + 'hover', showOriginalOnHover ? 'on' : 'off');
  for (const el of translatedSet) {
    applyModeClasses(el as HTMLElement, mode, showOriginalOnHover);
  }
}
