// Helper for content/options/popup scripts to call the background service worker
// with a timeout. MV3 service workers are non-persistent: if the SW is terminated
// while processing a request, `sendResponse` is never invoked and the caller
// would hang forever. This wrapper rejects after `timeoutMs` so callers can
// surface an error or fall back gracefully.

import type { ContentToBackground } from '../messaging';

export function sendToBackground<T = unknown>(
  msg: ContentToBackground,
  timeoutMs = 60000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('扩展后台响应超时'));
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message));
        else resolve(resp as T);
      });
    } catch (e) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e as Error);
    }
  });
}
