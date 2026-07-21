// Reads YouTube's in-page global `window.ytInitialPlayerResponse` from the
// page world (content scripts run in an isolated world and cannot access page
// globals directly). We inject a tiny inline script that responds to a
// postMessage request with the player response object.

const BRIDGE_CODE = `
(function () {
  function getPlayer() {
    return window.ytInitialPlayerResponse || null;
  }
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (d && d.__rfType === 'yt-request') {
      window.postMessage({ __rfType: 'yt-response', reqId: d.reqId, data: getPlayer() }, '*');
    }
  });
})();
`;

export function injectYoutubeBridge(): void {
  const s = document.createElement('script');
  s.textContent = BRIDGE_CODE;
  (document.head || document.documentElement).appendChild(s);
  s.remove();
}

/** Request the current player response from the page world. Resolves null on timeout. */
export function requestPlayerResponse(retries = 8, delayMs = 600): Promise<any> {
  return new Promise((resolve) => {
    let attempt = 0;
    const tryOnce = () => {
      const reqId = Math.random().toString(36).slice(2);
      const handler = (e: MessageEvent) => {
        if (e.source !== window || !e.data || e.data.__rfType !== 'yt-response' || e.data.reqId !== reqId) {
          return;
        }
        window.removeEventListener('message', handler);
        resolve(e.data.data ?? null);
      };
      window.addEventListener('message', handler);
      window.postMessage({ __rfType: 'yt-request', reqId }, '*');
      window.setTimeout(() => {
        window.removeEventListener('message', handler);
        if (attempt < retries) {
          attempt += 1;
          window.setTimeout(tryOnce, delayMs);
        } else {
          resolve(null);
        }
      }, delayMs);
    };
    tryOnce();
  });
}
